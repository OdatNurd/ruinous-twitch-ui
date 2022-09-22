import { config } from '#core/config';
import { logger } from '#core/logger';

import { PrismaClient } from '@prisma/client';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

import { db } from '#lib/db';
import { coreAPIRoutes } from '#routes/index';
import { setupTwitchIntegrations } from '#core/twitch';
import { initializeAddons } from '#addons/index';

import eiows from 'eiows';
import express from 'express';
import http from 'http';

import { redirectToHTTPS } from 'express-http-to-https';


// =============================================================================


/* Get our subsystem logger. */
const log = logger('core');


// =============================================================================


/* Send the static file given in response to the request; this is used solely
 * for client side routing reasons; it's needed for when the user hard reloads
 * a route on the client end, since from our perspective the whole site is a
 * single page. */
function fullfillSPARequest(req, res) {
  const log = logger('express');
  log.debug(`client side SPA reload for URL: ${req.url}`);

  const options = {
    root: config.get('webRoot'),
    dotfiles: 'deny',
    headers: {
      'x-timestamp': Date.now(),
      'x-sent': true,
      'x-item-filename': "index.html"
    }
  };

  res.sendFile("index.html", options, err => {
    if (err) {
      log.error(`SPA request error: ${err}`);
      res.status(404).send('error sending file');
    }
  });
}


// =============================================================================


/* Try to load an existing token from the database, and if we find one, use it
 * to set up the database. */
async function launch() {
  // log.debug(`configuration is: \n${config.toString()}`);

  log.debug(`baseDir: '${config.get('baseDir')}'`);
  log.debug(`webRoot: '${config.get('webRoot')}'`);

  // The express application that houses the routes that we use to carry out
  // authentication with Twitch as well as serve user requests.
  const app = express();
  app.use(express.json());

  // Redirect all insecure requests to a secure version of the URL, but not when
  // the host is localhost.
  app.use(redirectToHTTPS([/localhost:(\d{4})/], [], 302));

  // Set up some middleware that will serve static files out of the static
  // folder so that we don't have to inline the pages in code.
  app.use(express.static(config.get('webRoot')));

  // Create a server to serve our content
  const server = http.createServer(app);

  // Create a socket-io server using the eiows server as the back end, wrapped
  // inside of our main server.
  const io = new Server(server, {
    wsEngine: eiows.Server
  });

  // Set up all of the API endpoints and other core routes.
  app.use(coreAPIRoutes());

  // Wildcard all unknown routes to the index page to support client side routing;
  // this could maybe only cover routes we know exist? Or we need to know how to
  // get the client side router to display something for routes that don't exist.
  //
  // This has to happen last or we'll end up capturing other routes (I think).
  app.get("/*", (req, res) => fullfillSPARequest(req, res,));

  // Initialize Twitch
  setupTwitchIntegrations();

  // Initialize the back end code for all of the addons now.
  initializeAddons(db, io);

  // Get the server to listen for incoming requests.
  const webPort = config.get('port');
  server.listen(webPort, () => {
    log.info(`listening for requests at http://localhost:${webPort}`);
  });
}


// =============================================================================

launch();
