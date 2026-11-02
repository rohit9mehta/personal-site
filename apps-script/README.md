# Gmail → GitHub relay

Gets your StreetEasy alert emails to the apartment scan. A small Google Apps Script runs in your own Google account
every 10 minutes, picks out StreetEasy alert emails the scan hasn't read yet, and hands their text to the
[Apartments workflow](https://github.com/rohit9mehta/personal-site/actions/workflows/apartments.yml). Setup takes about
five minutes, once.

## 1. Save your searches on StreetEasy

On the site, open **Settings → Getting listings here**: there's a StreetEasy link for each of your filters. Open each
one, check it looks right, tap **Save**, and turn on **email alerts** (instant). Alerts must go to the Gmail account
you'll run the script in.

## 2. Make a GitHub token that can only start the scan

1. Go to [github.com/settings/personal-access-tokens/new](https://github.com/settings/personal-access-tokens/new).
2. **Token name:** `StreetEasy relay`. **Expiration:** a year is fine (put a reminder in your calendar).
3. **Repository access:** _Only select repositories_ → `rohit9mehta/personal-site`.
4. **Permissions → Repository permissions → Contents:** _Read and write_. Nothing else.
5. **Generate token** and copy it (it starts with `github_pat_`).

## 3. Create the script

1. Go to [script.google.com](https://script.google.com) → **New project**. Rename it `StreetEasy relay`.
2. Replace everything in `Code.gs` with the contents of [`streeteasy-relay.gs`](streeteasy-relay.gs) and save (⌘S).
3. **Project Settings** (⚙︎ in the left bar) → **Script properties** → **Add script property**: name `GITHUB_TOKEN`,
   value the token from step 2. **Save script properties**.
4. Back in the **Editor** (‹› in the left bar), choose `setup` in the function menu at the top and click **Run**.
5. Google asks for permission to read your Gmail, connect to an external service and run while you're away. It's your
   own script, so when it says _Google hasn't verified this app_, click **Advanced → Go to StreetEasy relay** and
   **Allow**.

The log ends with “All set”. From now on it runs every 10 minutes; new listings appear on the site a few minutes after
StreetEasy emails you.

## Checking on it

- **On the site:** Settings → Getting listings here shows when the last alert came through.
- **In Apps Script:** the **Executions** tab (☰▶) lists every run and any error.
- **On GitHub:** each batch of emails starts an
  [Apartments run](https://github.com/rohit9mehta/personal-site/actions/workflows/apartments.yml); its summary lists the
  listings it found.

## What it sends, and what it doesn't

- Only emails from StreetEasy that contain listing links, from the last four days, and only ones the scan hasn't
  already read. Your inquiries (“You Sent a Message About…”) and everything else in your inbox are skipped.
- Tracking links, social links and any email address are stripped before sending. GitHub keeps the text only for the
  scan run; what's saved is the listings themselves (address, price, beds, link) on the `apartments-data` branch.
- The token stays in the script's properties in your Google account.

## Turning it off

Apps Script → **Triggers** (⏰) → delete the `relay` trigger. Or revoke the token on GitHub.

## If something goes wrong

- **“Add your GitHub token”**: step 3.3 didn't save; add the `GITHUB_TOKEN` property again.
- **“GitHub said 401/403/404”**: the token expired or doesn't have _Contents: Read and write_ on `personal-site`. Make a
  new one (step 2) and replace the property.
- **Alerts arrive but no listings show up**: open the latest Apartments run on GitHub. A warning saying _No listings
  found_ means StreetEasy changed its email layout; the parser is `lib/apartments/streeteasy.ts`.
