# Bookmark Manager

Its like every other generic bookmark manager out there except 2 standout stuff.

Full webpage archiving both via screenshots and mhtml.
(yes not simple OG image or article, it captures and archives the whole page)

You have full control over the archiving so you control what is stored. 

Also it sync's to github with PAT. Everything.

I'm also uploading the dist cause I'm too lazy to do build and releases now. 

(Full Disclosure: Made with ai assistance.)

Build:

`npm i
npm run build`

Outputs to `dist`.

Pack Extension:

`node pack-ext.cjs`

Packs extension from `dist` and uses existing `key.pem` in root or creates one.

Outputs to `extension.crx`.
