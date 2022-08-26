import { config } from '../config.js';
import { db, dbErrResponse } from '../lib/db.js';
import { getAuthorizedUser } from '../lib/auth.js';
import { NotFound } from '../lib/exceptions.js';

import ksuid from 'ksuid';


// =============================================================================


/* Find and return back a dict that contains the addon ID's of all of the addons
 * that have been added by the user who is currently logged in as keys, and
 * information about those addons as objects. The current user is based on the
 * token provided in the request.
 *
 * If there's not a JWT token in the cookie, or it's not valid, then this will
 * return an empty dict. */
async function fetchUserAddons(db, req) {
  const result = {};

  // If there's nobody logged in, the result set will be empty.
  const userId = getAuthorizedUser(req, false);
  if (userId === null) {
    return result;
  }

  // Find all of the addons that this user has installed; then add their ID's
  // to the set.
  const data = await db.twitchUserAddons.findMany({
    where: { userId },
  });

  data.forEach(addon => result[addon.addonId] = addon);
  return result;
}


// =============================================================================


/* Fetch a complete list of all of the addons that are known and return back
 * their details in an array; in theory the array could be empty, although in
 * practice there is always data seeded into the database.
 *
 * If there is a user that is currently logged in, a check is done to see if
 * their channel has this addon installed, and if so the returned value will
 * indicate that by adding the following fields to the object.
 *
 *   - installed = true
 *   - config = { config object }
 *   - overlayUrl = 'http://something'
 *
 * The extra fields will not be present if there is not a logged in user. If
 * a user is logged in, then 'installed' is always added, even if its value
 * ends up being false. */
async function getAddonList(db, req, res) {
  try {
    // Fetch the complete list of addons that are known and, if there is
    // currently a logged in user, the list of addons that they have installed.
    //
    // findMany() always returns an array, even if it finds nothing (as opposed
    // to null).
    const result = await db.twitchAddon.findMany({});
    const userAddons = await fetchUserAddons(db, req);

    // Parse the timestamps out of the entry ID's, and then sort based on them to
    // put the entries into their creation order.
    result.forEach(entry => {
      entry.timestamp = ksuid.parse(entry.addonId).timestamp;

      // Pull out theuser information (if any) for this addon; we can use that
      // to know if this is installed or not.
      const userInfo = userAddons[entry.addonId];
      entry.installed = userInfo !== undefined;

      // If this addon is installed, then populate the configuration and
      // overlay URL (if any).
      if (entry.installed === true) {
        entry.config = JSON.parse(userInfo.configJSON);
        if (userInfo.overlayId !== '') {
          entry.overlayUrl = `${config.get('overlayBase')}/${userInfo.overlayId}`;
        }
      }

      // Parse the config schema into an object, if it's present.
      if (entry.configSchema !== undefined) {
        entry.configSchema = JSON.parse(entry.configSchema);
      }
    });
    result.sort((a, b) => a.timestamp - b.timestamp);

    res.json(result);
  }
  catch (error) {
    dbErrResponse(error, res);
  }
}


// =============================================================================


/* Find and return back the information on a particular addon, based on being
 * given either the slug for that addon or its addonID.
 *
 * If there is a user that is currently logged in, a check is done to see if
 * their channel has this addon installed, and if so the returned value will
 * indicate that by adding the following fields to the object.
 *
 *   - installed = true
 *   - config = { config object }
 *   - overlayUrl = 'http://something'
 *
 * The extra fields will not be present if there is not a logged in user. If
 * a user is logged in, then 'installed' is always added, even if its value
 * ends up being false. */
async function getAddonById(db, req, res) {
  try {
    // Check to see if there's an authorized user or not
    const userId = getAuthorizedUser(req, false);

    // Find the addon with the slug or ID provided.
    const body = await db.twitchAddon.findFirst({
      where: {
        OR: [
          { slug: req.params.key },
          { addonId: req.params.key },
        ]
      }
    });

    // Signal back if there was nothing found.
    if (body === null) {
      throw new NotFound(`no such addon '${req.params.key}'`);
    }

    // Parse the config schema into an object.
    body.configSchema = JSON.parse(body.configSchema);

    // If we got a user, we need to look to see if they have installed this
    // addon or not; if not, assume the lookup failed.
    let userConfig = null;
    if (userId !== null) {
      userConfig = await db.twitchUserAddons.findUnique({
        where: {
          userId_addonId: { userId, addonId: body.addonId }
        },
      });
    }

    // Flag whether or not this is installed;
    body.installed = userConfig !== null;

    // If this addon is installed, then set up the overlay URL and the
    // configuration information and add them to the body.
    if (body.installed === true) {
      const overId = userConfig.overlayId;

      body.overlayUrl = (overId === '' ? '' : `${config.get('overlayBase')}/${overId}`)
      body.config = JSON.parse(userConfig.configJSON);
    }

    res.json(body || {})
  }
  catch (error) {
    dbErrResponse(error, res);
  }
}


// =============================================================================


/* This does the work of adding all of the routes needed for the Addons portion
 * of the API to the provided application. */
export function addAddonAPIs(app) {
  app.get('/api/v1/addons', (req, res) => getAddonList(db, req, res));
  app.get('/api/v1/addons/:key', (req, res) => getAddonById(db, req, res));
}


// =============================================================================

