# Search and Replace Extension for Chromium based browsers

Allows you to search for text anywhere on the page and replace it with different text. For example:

- quickly correct forms in which the wrong information has been entered multiple times
- edit the text in Content Manage Systems editors such as the WordPress post editor
- edit the HTML of the page
- use regular expressions as a search term
- capture matches from the regular expressions search term and apply as part of the replacement
- save the instance of the search and replace and apply to all subsequent page visits
- match pages by regular expressions to apply rules to many different web pages

Please Note:

1. You must refresh the page or restart chrome before using.
2. Please select "Input Fields Only" if you are editing text in a text editor or form.
2. The popup will not stay open if you click elsewhere. This is a feature of Chrome.

View a video of it in action here: http://www.youtube.com/watch?v=tf0D8RUdwkI

## Issues

Please report issues [here](https://github.com/forgetso/search-replace/issues/new/choose) and include the following information:

- Version
- Web page
- Search and Replace options used (e.g. Input Fields Only)

## Contributing

You can create PRs to further develop this extension. To get started, you can follow the instructions below to run the
extension locally.

1. Clone this repo ```git clone https://github.com/forgetso/search-replace.git```
2. Uninstall Search and Replace
3. [Enable developer mode in Extensions menu of chrome](https://developer.chrome.com/docs/extensions/mv3/getstarted/development-basics/#load-unpacked)
   so that you can load unpacked Chrome extensions
4. Go to the directory where you cloned this repo
5. Install the dependencies `npm i`
6. Build the extension in development mode ```npm run watch``` (this will create a directory called `dist`)
7. Go to the [Extensions page](chrome://extensions) and select `Load Unpacked`
8. Navigate to the root folder of the repository and select the `dist` folder and press ok

You will now have a local copy of the extension running in your browser. You can edit the TypeScript files and the
extension will automatically rebuild thanks to the `npm run watch` command. To see the changes in your browser you will
need to hit the reload button underneath Search and Replace on the [Extensions page](chrome://extensions) and then also
reload the web page on which you are doing the replacements.

Feel free to submit a PR if you make any improvements!
