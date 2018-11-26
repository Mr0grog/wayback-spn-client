# wayback-spn-client

This is an experimental tool using Headless Chrome to trigger the Internet Archive's “Save Page Now” feature. Why use a browser instead of just making an HTTP request? At current, making a simple HTTP request only archives the page itself and not any of its subresources (images, CSS, etc.). However, accessing the same save page now URL with a browser *does* archive subresources. Folks at the Internet Archive are working on a new “Save Page Now” that fixes this, but don’t know when it’ll be launched.


## Usage

First, make sure you install dependencies with `npm install`. Then, create a text file with a list of URLs you want to archive (one URL per line). Finally run `index.js`:

```sh
> node index.js path/to/your/url/list.txt
```

It will output the archived URL (or error information) for each URL in your file.


## License

Wayback-spn-client is open source software. It is (c) 2018 Rob Brackett and licensed under the BSD license. The full license text is in the `LICENSE` file.
