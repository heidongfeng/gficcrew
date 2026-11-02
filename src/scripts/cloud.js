import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk';

// Values come from the app's cloud-service publicConfig (endpoint + publishableKey).
// endpoint is the application's registered release domain — it must stay in sync with
// the domain this site is published on, otherwise the server's Origin check rejects calls.
const PUBLIC_CONFIG = {
  endpoint: 'https://gficcrew.app.workbuddy.host',
  publishableKey: 'wbpk_1uORfVuxR6GP7CtKSD3Ciw_ZlNBhhoZQmyPg3rXxYL6aZvBv5miIAum',
};

export const cloud = createWorkBuddyCloud({
  endpoint: PUBLIC_CONFIG.endpoint,
  publishableKey: PUBLIC_CONFIG.publishableKey,
});

export const TABLES = {
  requests: 'crew_requests',
  photos: 'crew_photos',
};

/** Shows a message box; `kind` is 'ok' or 'err'. */
export function showMessage(node, text, kind) {
  if (!node) return;
  node.textContent = text;
  node.className = 'msg is-visible msg--' + (kind || 'err');
}

/** Wires a form to a cloud insert. `buildRow` turns FormData into a row object. */
export function bindInsertForm({ form, message, submit, table, buildRow, successText }) {
  if (!form) return;
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const idleLabel = submit ? submit.textContent : '';
    if (submit) {
      submit.disabled = true;
      submit.textContent = 'Sending…';
    }
    try {
      const row = buildRow(new FormData(form));
      const { error } = await cloud.database.from(table).insert(row);
      if (error) throw new Error(error.message);
      showMessage(message, successText, 'ok');
      form.reset();
    } catch (err) {
      console.error('[GFIC] form submit failed', { table, message: err && err.message });
      showMessage(
        message,
        (err && err.message) || 'Something went wrong. Please try again or add WeChat DN8117.',
        'err',
      );
    } finally {
      if (submit) {
        submit.disabled = false;
        submit.textContent = idleLabel;
      }
    }
  });
}
