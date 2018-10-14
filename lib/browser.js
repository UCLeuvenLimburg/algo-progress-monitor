const puppeteer = require('puppeteer');


async function createBrowser()
{
    return await puppeteer.launch({headless: true});
}

async function withBrowser(f)
{
    const browser = await createBrowser();

    try
    {
        return await f(browser);
    }
    catch ( e )
    {
        console.error(`Error while using browser: ${e}`);
    }
    finally
    {
        await browser.close().catch(e => console.error(`Error while closing browser: ${e}`));
    }
}


module.exports = {
    createBrowser,
    withBrowser,
};