const Path = require('path');
const process = require('process');
const git = require('simple-git/promise');
const program = require('commander');
const { withBrowser } = require('./browser');
const { setVerbosity: setLogVerbosity, log, context } = require('./log');
const Repository = require('./repository');
const request = require('request-promise-native');
const { inDirectory } = require('./fs-util');
const { runTests } = require('./testing');


function values(object)
{
    return Object.keys(object).map(key => object[key]);
}

function sum(ns)
{
    return ns.reduce((x, y) => x + y, 0);
}

function objectMap(object, f)
{
    const result = {};

    for ( const key of Object.keys(object) )
    {
        result[key] = f(object[key]);
    }

    return result;
}

async function findRepositoryAtCurrentLocation()
{
    return await context(`Looking for repository at current location ${process.cwd()}`, async () => {
        const gitRepo = git('.');

        if ( await gitRepo.checkIsRepo() )
        {
            return new Repository(gitRepo);
        }
        else
        {
            console.error(`No git repository found at current location ${process.cwd()}.`);
            process.exit(-1);
        }
    });
}

async function gatherTestResults(repo)
{
    return context(`Running all tests`, async () => {
        return withBrowser(async (browser) => {
            const result = {};
            const chapters = await repo.chapters;

            for ( let chapter of chapters )
            {
                console.error(`Running tests from chapter ${chapter.id}`);

                const { results } = await chapter.test(browser);
                result[chapter.id] = results;
            }

            return result;
        });
    });
}

async function runRepositoryTests(path)
{
    return await inDirectory(path, async () => {
        const repo = await findRepositoryAtCurrentLocation();
        const testResults = await gatherTestResults(repo);
        const byChapterResults = {};

        for ( let chapterId of Object.keys(testResults) )
        {
            const chapterTestResults = testResults[chapterId];

            byChapterResults[chapterId] = chapterTestResults;
        }

        return byChapterResults;
    });
}

async function runTestsAt(paths)
{
    const table = {};

    return withBrowser(async (browser) => {
        for ( const path of paths )
        {
            console.error(`Running tests in ${path}`);

            const { chapter, results } = await runTests(browser, path);
            table[path] = { [chapter]: results };
        }

        return table;
    });
}


async function checkRepositoryProgress(paths)
{
    const results = {};

    for ( const path of paths )
    {
        console.error(`Running tests in ${path}`);
        results[path] = await runRepositoryTests(path);
    }

    return results;
}

function generateHtml(studentsResults)
{
    const defaultScores = buildDefaultScores();

    return `
        <html>
            <head>
                <meta charset="UTF-8">
                <style>
                    table {
                        margin: 1em auto;
                        border-collapse: collapse;
                    }

                    th {
                        background: black;
                        color: white;
                        padding: 0.2em 1em;
                    }

                    td {
                        text-align: center;
                        padding: 0.2em 0.5em;
                    }

                    td.student {
                        text-align: right;
                        font-weight: bold;
                    }

                    tr:nth-child(odd) {
                        background: #CCC;
                    }

                    tr:nth-child(even) {
                        background: #DDD;
                    }
                </style>
            </head>
            <body>
                <table>
                    <tbody>
                        ${generateHeaderRow()}
                    </tbody>
                    ${generateRows()}
            </body>
        </html>
    `;

    function generateRows()
    {
        const studentIds = Object.keys(studentsResults);
        const totalAnswered = objectMap(studentsResults, studentResults =>
            sum( values(studentResults).map( chapterResults =>
                    sum(values(chapterResults).map( ({grade}) => grade )) ))
        );

        studentIds.sort( (x, y) => totalAnswered[y] - totalAnswered[x] );

        let result = studentIds.map( studentId => {
            const resultsByChapter = { ...defaultScores, ...scoresByChapter(studentsResults[studentId]) };

            const tds = Object.keys(defaultScores).map(chapterName => {
                const { totalGrade, totalMaximum } = resultsByChapter[chapterName];
                const percentage = 100 * totalGrade / totalMaximum;
                // return `<td>${percentage.toFixed(0)}</td>`;
                return `<td>${totalGrade}</td>`;
            }).join('');

            return `<tr><td class="student">${studentId}</td><td>${totalAnswered[studentId]}</td>${tds}</tr>`;
        });

        return result.join('');
    }

    function generateHeaderRow()
    {
        const headers = Object.keys(defaultScores).map(chapterName => `<th>${chapterName}</th>`).join('');

        return `<tr><th /><th>Totaal</th>${headers}</tr>`;
    }

    function chapters()
    {
        const firstStudent = Object.keys(studentsResults)[0];
        const firstStudentResults = studentsResults[firstStudent];
        return Object.keys(firstStudentResults);
    }

    function buildDefaultScores()
    {
        const result = {};

        for ( const chapter of chapters() )
        {
            const totalGrade = 0;
            const totalMaximum = 0;

            result[chapter] = { totalGrade, totalMaximum };
        }

        return result;
    }

    function scoresByChapter(studentResults)
    {
        const result = {};

        for ( const chapterId of Object.keys(studentResults) )
        {
            const chapterScores = studentResults[chapterId];
            let totalGrade = 0;
            let totalMaximum = 0;

            for ( const problemId of Object.keys(chapterScores) )
            {
                const { grade, maximum } = chapterScores[problemId];

                totalGrade += grade;
                totalMaximum += maximum;
            }

            result[chapterId] = { totalGrade, totalMaximum };
        }

        return result;
    }
}

function getPackageInfo()
{
    return require('../package.json');
}

function fetchVersion()
{
    return getPackageInfo().version;
}

async function main()
{
    program
        .version(fetchVersion())
        .option('-v, --verbose', 'Verbose output');

    program
        .command('progress [dirs...]')
        .description(`run tests in repo`)
        .action((dirs, options) => {
            go().catch(reason => console.error(`Error: ${reason}`));

            async function go()
            {
                processGlobalArguments(options.parent);
                console.log(JSON.stringify(await checkRepositoryProgress(dirs, options)));
            }
        });

    program
        .command('test [dirs...]')
        .description(`run tests in directories`)
        .action((dirs, options) => {
            go().catch(reason => console.error(`Error: ${reason}`));

            async function go()
            {
                processGlobalArguments(options.parent);
                console.log(JSON.stringify(await runTestsAt(dirs, options)));
            }
        });

    program
        .command('html [results]')
        .description(`generate html based on results`)
        .action((file, options) => {
            go().catch(reason => console.error(`Error: ${reason}`));

            async function go()
            {
                processGlobalArguments(options.parent);
                const results = require(Path.resolve(file));
                console.log(generateHtml(results));
            }
        });

    program.parse(process.argv);

    if ( process.argv.length < 3 )
    {
        program.help();
    }

    function processGlobalArguments(args)
    {
        if ( args.verbose )
        {
            setLogVerbosity(true);
        }
    }
}

// process.on('unhandledRejection', (reason, p) => {
//     console.error(`Promise ${p}`);
//     console.error(`Reason: ${reason}`);
//     console.error(`Stack: ${reason.stack}`);
// });

main()