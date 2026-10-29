# Binder Exchange

A private trade board for a Magic: The Gathering playgroup. Everyone shares
one roster, one set of binders, and one list of matches — instead of
spreadsheets, group chats, and “do you still have that card?”

The live app is at [mtg-trader-five.vercel.app](https://mtg-trader-five.vercel.app).

## What it does

- **Roster.** Each friend has a collection and a wishlist, imported from
  Archidekt, Moxfield, or a CSV, or edited by hand.
- **Matches.** The board shows who has a card someone else wants, with
  Cardmarket EUR prices from Scryfall.
- **Trades.** Propose a swap, accept or decline it, leave comments, and
  mark it completed. Accepted cards stay reserved so they don’t show up in
  other matches.
- **Notifications.** A bell for new proposals, replies, and when a card
  you want lands in a friend’s binder.
- **Profile.** Display name, which alerts you want, and
  pause-your-binder while you’re away.

Accounts use a name and password. Regular traders only edit their own
binder; admins can help with anyone’s.

## Feature requests

Something missing? Open a feature request — it pre-fills a short form on
GitHub:

**[Request a feature](https://github.com/luisftmarin/mtg_trader/issues/new?template=feature_request.yml&labels=enhancement)**

In the app, use the **Request a feature** button next to the notification bell.

## Stack

React (Vite) in `client/`, Express in `server/`, Postgres for the shared
board. Card images and prices come from Scryfall.

To run it locally or deploy a copy, see [docs/setup.md](docs/setup.md).
