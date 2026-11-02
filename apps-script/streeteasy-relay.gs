/**
 * StreetEasy → GitHub relay for the apartment hunt.
 *
 * Runs in your own Google account (script.google.com), every 10 minutes:
 * finds StreetEasy saved-search alert emails the scan hasn't read yet and
 * hands them to the Apartments workflow on GitHub. Your Gmail never leaves
 * Google except for those alert emails' text; the GitHub token never leaves
 * this script. Setup steps: apps-script/README.md.
 */

const REPO = 'rohit9mehta/personal-site';
/** Which emails to look at. */
const QUERY = 'from:(streeteasy.com) newer_than:4d';
/** Give up on an email after this many tries (the scan reads each one only once). */
const MAX_TRIES = 3;
/** Emails per request to GitHub. */
const BATCH = 4;

/** Run this once by hand: it checks the setup and schedules `relay` every 10 minutes. */
function setup() {
  token_();
  for (const trigger of ScriptApp.getProjectTriggers()) ScriptApp.deleteTrigger(trigger);
  ScriptApp.newTrigger('relay').timeBased().everyMinutes(10).create();
  const sent = relay();
  console.log(`All set. Sent ${sent} email(s) now; from here on this runs every 10 minutes.`);
}

/** Sends new alert emails to GitHub. Returns how many it sent. */
function relay() {
  const token = token_();
  const done = new Set(processedIds_());
  const props = PropertiesService.getScriptProperties();
  const tries = JSON.parse(props.getProperty('tries') || '{}');

  const pending = [];
  for (const thread of GmailApp.search(QUERY, 0, 50)) {
    for (const message of thread.getMessages()) {
      const id = message.getId();
      if (done.has(id) || (tries[id] || 0) >= MAX_TRIES) continue;
      const subject = message.getSubject();
      // Your own inquiries ("You Sent a Message About…") aren't alerts.
      if (/^you sent a message/i.test(subject)) continue;
      const text = message.getPlainBody();
      // Alerts list prices and bedrooms; account and marketing emails don't.
      if (!/\$\s?\d/.test(text) || !/\b(beds?|studio)\b/i.test(text)) continue;
      pending.push({ id, date: message.getDate().toISOString(), subject, text: tidy_(text) });
    }
  }

  for (let i = 0; i < pending.length; i += BATCH) {
    const batch = pending.slice(i, i + BATCH);
    const res = UrlFetchApp.fetch(`https://api.github.com/repos/${REPO}/dispatches`, {
      method: 'post',
      contentType: 'application/json',
      muteHttpExceptions: true,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      payload: JSON.stringify({ event_type: 'streeteasy-alert', client_payload: { emails: batch } }),
    });
    if (res.getResponseCode() >= 300) {
      throw new Error(`GitHub said ${res.getResponseCode()}: ${res.getContentText().slice(0, 300)}`);
    }
    for (const e of batch) tries[e.id] = (tries[e.id] || 0) + 1;
  }

  // Keep the retry counts small.
  const recent = new Set(pending.map((e) => e.id));
  for (const id of Object.keys(tries)) if (!recent.has(id) && done.has(id)) delete tries[id];
  props.setProperty('tries', JSON.stringify(tries));
  if (pending.length) console.log(`Sent ${pending.length} alert email(s) to GitHub.`);
  return pending.length;
}

function token_() {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_TOKEN');
  if (!token) {
    throw new Error('Add your GitHub token: Project Settings (⚙︎) → Script properties → GITHUB_TOKEN.');
  }
  return token;
}

/** Gmail ids the scan has already read, from the data it publishes. */
function processedIds_() {
  const url = `https://raw.githubusercontent.com/${REPO}/apartments-data/scan.json?nocache=${Date.now()}`;
  const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) return [];
  try {
    return JSON.parse(res.getContentText()).emails.map((e) => e.id);
  } catch (err) {
    return [];
  }
}

/** Drops tracking links, social links and your email address; keeps the listings. */
function tidy_(text) {
  return text
    .replace(/<?https?:\/\/links\.streeteasy\.com\/e\/(eh|evib)\S*/g, '') // unsubscribe, view in browser
    .replace(
      /<?https?:\/\/(app\.us\.adjust\.com|twitter\.com|www\.facebook\.com|www\.instagram\.com|www\.tiktok\.com|www\.zillowgroup\.com)\S*/g,
      '',
    )
    .replace(/(https?:\/\/(?:www\.)?streeteasy\.com\/[^\s>?]*)\?[^\s>]*/g, '$1')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .slice(0, 60000);
}
