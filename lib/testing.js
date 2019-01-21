const Path = require('path');
const fileurl = require('file-url');
const { log, context } = require('./log');


async function runTests(browser, htmlPath)
{
    return await context(`Running tests`, async () => {
        try
        {
            const absoluteHtmlPath = Path.resolve(htmlPath);
            log(`Full path of html: ${absoluteHtmlPath}`);

            const url = fileurl(absoluteHtmlPath);
            log(`Url: ${url}`);

            log(`Creating new browser page`);
            const page = await browser.newPage();

            log(`Browsing to ${url}`);
            await page.goto(url);

            log(`Evaluating tests`);
            const result = await page.evaluate('shell.runTests()');

            log(`Finished running tests in ${htmlPath}`);
            return result;
        }
        catch ( e )
        {
            console.error(`Error occurred while testing chapter ${this.id}:\n${e}`);
            return { chapter: this.id, results: {} };
        }
    });
}


module.exports = { runTests };