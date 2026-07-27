# Third-party data notice

Nota's own code is MIT licensed (see `LICENSE`). At runtime it also calls two
external services; neither one is bundled with the extension or committed to
this repository — nothing from either is redistributed.

## Swedish grammar lookup

Grammar data (noun/verb/adjective inflection forms) is fetched live, per word,
from [Språkbanken Text](https://spraakbanken.gu.se/) (University of
Gothenburg) — resource `saldom`, SALDO's morphology:
https://spraakbanken.gu.se/en/resources/saldom

That resource is licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
Nota does not bundle or redistribute the dataset itself; it queries a single
word at a time and stores only that word's resulting inflection forms in the
user's own local notes, on their own device, for their own reference.

Attribution: inflection data from Språkbanken Text, University of Gothenburg —
SALDO ("Saldos morfologi"), licensed under CC BY 4.0.

## Translation suggestions

Translation suggestions use an unofficial endpoint behind Google Translate
(`translate.googleapis.com`) — not an official, licensed API. See the in-app
warnings for details; treat it as best-effort, not a guaranteed dependency.

## Development

This extension was built with the assistance of Claude (Anthropic).
