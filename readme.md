# Rialto: Make Conferences More Fun with Microsoft Teams
Rialto improves the experience of using Microsoft Teams for conferences by showing a curated view of real-time channel chat activity that is optimized for viewing on a large screen.

## Why?

Some internal Microsoft conferences (WHiPS, O3) have adopted a format where a "side channel" of live chat activity is projected to screens to the sides of the main presentation content. This allows the audience to engage by posting questions, comments, snarky observations, semi-on-topic humor, etc.

In the past, the chat view would simply be a raw feed, updating whenever anything was posted. This proved to be a little too distracting and led to a low signal-to-noise ratio (especially when people got carried away with animated GIFs...). Also, once we switched from a custom chat solution to Microsoft Teams, its tendency to evict  newer threads from view when a reply to an older thread is posted led to a very jumpy and hard-to-follow live view experience.

Rialto solves this by showing a semi-moderated view of chat activity that is easy to read in a conference setting.

## How?

Rialto is a Node.js application that implements a [Microsoft Teams bot](https://docs.microsoft.com/en-us/microsoftteams/platform/concepts/bots/bots-overview) to listen to chat activity, and a website to show the live view (along with some related stuff, like the conference agenda).

To use:

1. Set up a Teams bot using the instructions above and add it to the team you want it to listen to. You will need the bot *appId* and *password*. **IMPORTANT NOTE**: The bot relies on the ability to receive messages even when not explicitly @-mentioned; this feature is not yet broadly available.
1. Set up Azure storage with tables named *agenda*, *conversations*, *replies*, and *metadata*. See state.js for schema details. You will need to pre-seed the *agenda* and *metadata* table with some content (using Azure Storage Explorer, for example). 
1. Deploy the application to a web site host of your choice. Azure App Services is recommended, but any Node.js host should do. You will need to make sure the following environment variables are set:
    * `APPSETTING_BOT_APP_ID`
    * `CUSTOMCONNSTR_BOT_APP_PASSWORD`
    * `CUSTOMCONNSTR_TABLE_STORAGE`

**NOTE**: There is still some O3-specific branding and help text baked into the code that hasn't been factored out yet.

Please contact [pbaer@microsoft.com](mailto:pbaer@microsoft.com) for help.

## License

MIT