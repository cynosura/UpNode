//
// UpNode 
//
// v0.0.2
// Authors: Alexander Schuch 
//          Raymond Glover 
//
// http://github.com/aschuch
// http://schuch.me
// hello@schuch.me
//
var http = require('http')
  , url = require('url')
  , path = require('path')
  , fs = require('fs')
  , moreFs = require( './lib/fs' )
  , mime = require('mime')
  , Formidable = require('formidable')
  , config = require('./server-config.json');

// Configuration options
var uploadsPath = __dirname + config.uploadsPath
  , port = process.argv[2] || config.port
  , mimeTypeWhitelist = config.mimeTypeWhitelist; 

// server setup
http.createServer(function(req, res) {

   //
   // prevent double requests
   // https://gist.github.com/763822
   //
   if (req.url === '/favicon.ico') {
      res.writeHead(200, {'Content-Type': 'image/x-icon'} );
      res.end();
      return;
   }

   //
   // ROUTER
   // setup simple RESTful routing
   //
   var method = req.method.toLowerCase();

   if (method === 'get') {
      serveFile(req, res);
   } else if (method === 'post') {
      saveFile(req, res);
   }

   // --------------------

   //
   // GET request
   // serve the requested file if it exists
   //
   function serveFile(req, res) {
      var uri = url.parse(req.url).pathname
        , filename = path.join(uploadsPath, uri);
  
      fs.exists(filename, function(exists) {

         // check if file exists
         if(!exists) {
            res.writeHead(404, {'Content-Type': 'text/plain'});
            res.end('404 Not Found\n' + filename + ' does not exist.');
            return;
         }

         if (fs.statSync(filename).isDirectory()) {
            // file is directory, output directory listing as json
            res.writeHead(404, {'Content-Type': 'application/json'});
            res.end(JSON.stringify(fs.readdirSync(filename)));
         } else {
           // serve file
           fs.readFile(filename, 'binary', function(err, file) {
              if(err) {
                 res.writeHead(500, {'Content-Type': 'text/plain'});
                 res.end(err);
                 return;
              }

              // lookup correct mime type
              var mimeType = mime.lookup(filename);

              res.writeHead(200, {'Content-Type': mimeType});
              res.end(file, 'binary');
           });
         }
      });
   }

   // --------------------

   //
   // POST request
   // save the given files to disk
   //
   function saveFile(req, res) {
      res.writeHead(200, {'Content-Type': 'application/json'});

      // map url to path
      var url = require('url').parse( req.url, false )
        , pathname = path.join( '/', url.pathname )
        , dirname;
        
      // if the path ends with '/', treat url as directory location
      if( pathname.lastIndexOf( path.sep ) === pathname.length - 1 ) {
         dirname = pathname;
         filename = null;
      } else {
         dirname = path.dirname( pathname );
         filename = path.basename( url.pathname );
      }

      // JSON return object
      var json = {};

      // JSON defaults
      json.errors = false;
      json.numberOfFiles = 0;
      json.files = [];

      // parse file upload
      var form = new Formidable.IncomingForm()
        , progress = null
        , bytesAlreadyReceived = 0
        , files = []
        , fields = {};

      form
         // error
         .on('error', function(err) {
            json.error = err;
            res.end(JSON.stringify(json));
         })

         // set the file path
         .on('fileBegin', function(name, file) {
            var dirpath = path.join( uploadsPath, dirname );
            
            // create dir path if it doesn't already exist
            moreFs.mkdirSync( dirpath, null, true /* recursive */ );
            
            // if request path doesnt contain file name, use name of the uploaded file
            file.path = path.join( dirpath, filename || file.name );
            process.stdout.write('File: ' + file.path + '\n');
         })

         // progress
         .on('progress', function(bytesReceived, bytesExpected) {
            var percent = ((bytesReceived/bytesExpected)*100).toFixed(2);
            process.stdout.write('\033[2K' + 'Uploading: ' + percent + '%');
         })

         // incoming file
         .on('file', function(field, file) {

            // Check file for allowed/whitelisted files
            var mimeType = mime.lookup(file.name);
            if (typeof(mimeTypeWhitelist) !== 'undefined' && mimeTypeWhitelist.length > 0) {
               
               // actually use the whitelist
               if(mimeTypeWhitelist.indexOf(mimeType) == -1) {
                  // error, the file's mime is not white listed
                  console.log("\nIgnoring uploaded file '" + file.name + "' of type '" + mimeType + "', the file's mime type is not white listed.");
                  return;
               }
            }

            // add file to files list
            var fileInfo = {
              name:             file.name,
              size:             file.size,
              pathname:         path.relative( uploadsPath, file.path ),
              lastModifiedDate: file.lastModifiedDate,
              mimeType:         mimeType
            };

            files.push(fileInfo);
         })

         // fields, other query params
         .on('field', function(name, value) {
            fields[name] = value;
         }) 

         // end of request
         .on('end', function() {
            //json.params = params;
            json.fields = fields;
            json.files = files;
            json.numberOfFiles = files.length;
            res.end(JSON.stringify(json));

            process.stdout.write('\r\033[2K' + 'Uploading: [DONE]\n');

         });
      form.parse(req);
   }

}).listen(parseInt(port, 10), 'localhost');

console.log('File server running at\n  => http://localhost:' + port + '/\nCTRL + C to shutdown\n');
