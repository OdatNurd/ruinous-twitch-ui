import { NotFound } from '../lib/exceptions.js';
import { db, dbErrResponse } from '../lib/db.js';


// =============================================================================


/* Find and return back the information on a particular overlay, based on being
 * given the specific overlay ID. The return value will also include information
 * on the addon itself as well as the user that owns the overlay.
 *
 * This does not require a user to be logged in, and in fact will provide the
 * full details of any overlay whose ID is provided. This is because overlays
 * are meant to be loaded as browser sources, where a login mechanism is not
 * a great UX (or available in all situations).
 *
 * The information this provides is information on the specific configuration
 * for any given overlay, and the inference that it us up to the user to not
 * leak the URL, since anyone that gets it can load the page and expose the
 * information. */
async function getOverlayInfo(db, req, res) {
  try {
    // We have a userId, so look up all of the addons that this particular user
    // has added; this will always be an array, even if that array is empty.
    const data = await db.twitchUserAddons.findMany({
      where: { overlayId: req.params.overlayId },
      include: { addon: true, owner: true }
    });

    // There should only be a single hit; any more or any less indicates that
    // something went wrong. Probably not great to use a 404 for this if there
    // are more than one hit, but we haven't made the overlayId unique yet.
    if (data.length !== 1) {
      throw new NotFound(`no such overlay '${req.params.overlayId}'`);
    }

    const body = data[0];
    body.addon.configSchema = JSON.parse(body.addon.configSchema);
    body.configJSON = JSON.parse(body.configJSON);

    return res.json(body);
  }
  catch (error) {
    dbErrResponse(error, res);
  }
}


// =============================================================================


/* A helper function that can be assigned to a route in order to generate an
 * error that indicates that this API endpoint does not exist. */
function reportInvalidAPI(db, req, res) {
  try {
    throw new NotFound('invalid API endpoint')
  }
  catch (error) {
    dbErrResponse(error, res);
  }
}


// =============================================================================


/* This does the work of adding all of the routes needed for the Overlays
 * portion of the API to the provided application. */
export function addOverlayAPIs(app) {
  app.get('/api/v1/overlay/', (req, res) => reportInvalidAPI(db, req, res));
  app.get('/api/v1/overlay/:overlayId', (req, res) => getOverlayInfo(db, req, res));
}


// =============================================================================

