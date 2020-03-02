const http = require('http');
const httpProxy = require('http-proxy');
const web_o = Object.values(require('http-proxy/lib/http-proxy/passes/web-outgoing.js'));
const shortId = require("shortid");
const {performance, PerformanceObserver} = require('perf_hooks');
 
const zlib = require('zlib');
const {Transform} = require('stream');

const textRegex = new RegExp('text'), htmlRegex = new RegExp('html'), jsRegex = new RegExp('js'), cssRegex = new RegExp('css'), jsExtRegex = new RegExp('.js'), cssExtRegexp = new RegExp('.css');

const proxy = httpProxy.createProxyServer({
    proxyTimeout: 60000,
    selfHandleResponse: true
});


const performanceTracker = (log) => {
    const cache = {};
    console.log(log)

}

const obs = new PerformanceObserver((list, obeserver) => {
    const entryObj = list.getEntries();
    performanceTracker(entryObj);
});

obs.observe({entryTypes: ['measure'], buffered: true})

proxy.on('error', (err, req, res) => {
     console.error(`Got an error from origin:
     Request: ${req}
     Error: ${err}`);

     res.writeHead(500, {
        'Cache-control': 'no-cache, no-store'
     });

     res.end("Internal Server Error");
});

proxy.on('proxyRes', (proxyRes, req, res) => {
    const requestId = req.shortId;
    const target = req.headers.target;
    console.log("Recieved response from origin: ", requestId);
    var numberOfChuncks = 0;
    performance.mark(`${target} - ${requestId} -- origin_response`);

    if (
        (proxyRes && proxyRes.headers) 
        &&
        (proxyRes.headers["content-type"] && (textRegex.test(proxyRes.headers["content-type"]) || htmlRegex.test(proxyRes.headers["content-type"]))) 
        &&
        (proxyRes.headers["content-type"] && !jsRegex.test(proxyRes.headers["content-type"]) && !cssRegex.test(proxyRes.headers["content-type"])) 
        && 
        (proxyRes.url.toLowerCase().indexOf(jsExtRegex) === -1) && (proxyRes.url.toLowerCase().indexOf(cssExtRegexp) === -1)
        &&
        req.headers["test"] === "true"
      ) {

        const gunzip = zlib.createGunzip(), gzip = zlib.createGzip();

        const transform = new Transform({
            transform(chunk, encoding, callback) {
                let data = chunk.toString();
                data = data.toUpperCase();
                this.push(Buffer.from(data, 'utf-8'));
                callback();
            }
        });

        const mock_res = new Transform({
            transform(chunk, encoding, callback) {
                this.push(chunk);
                callback();
            }
        });

        gunzip.on('data', () => {
            numberOfChuncks += 1;
        })

        gunzip.once('data', () => {
            console.log('data gunzip.');
            performance.mark(`${target} - ${requestId} -- decompression_start`);
        })

        
        gunzip.on('drain', () => {
            console.log('drain gunzip.');
            performance.mark(`${target} - ${requestId} -- decompression_end`);
        })

        gunzip.on('finish', () => {
            console.log('finished gunzip.');
        });


        transform.once('data', () => {
            console.log('data in transform.');
            performance.mark(`${target} - ${requestId} -- transform_start`);
        });

        transform.on('drain', () => {
            console.log('drain transform.');
            performance.mark(`${target} - ${requestId} -- transform_end`);
        })

        gzip.once('data', () => {
            console.log('data gzip.');
            performance.mark(`${target} - ${requestId} -- compression_start`);
        })

        gzip.on('drain', () => {
            console.log('drain gzip.');
            performance.mark(`${target} - ${requestId} -- compression_end`);
        });

        gzip.on('finish', () => {
            console.log('finished gzip.');
        });

        mock_res.once('data', () => {
            console.log('data in res.');
            performance.mark(`${target} - ${requestId} -- response_start`);
        });

        mock_res.on('drain', () => {
            console.log('drain res.');
            performance.mark(`${target} - ${requestId} -- response_end`);
        });

        res.on('finish', () => {
            console.log('finished res.');
        //     performance.measure(`${target} - ${requestId} -- total_decompression::${numberOfChuncks}`, `${target} - ${requestId} -- decompression_start`, `${target} - ${requestId} -- decompression_end`);
        //     performance.measure(`${target} - ${requestId} -- total_transformation::${numberOfChuncks}`, `${target} - ${requestId} -- transform_start`, `${target} - ${requestId} -- transform_end`);
        //   performance.measure(`${target} - ${requestId} -- total_compression::${numberOfChuncks}`, `${target} - ${requestId} -- compression_start`, `${target} - ${requestId} -- compression_end`);
            performance.measure(`${target} - ${requestId} -- total_extra_time::${numberOfChuncks}`, `${target} - ${requestId} -- decompression_start`, `${target} - ${requestId} -- response_start`);
        });

        delete proxyRes.headers["content-length"];

        const options = {};
        for(var i=0; i < web_o.length; i++) {
            web_o[i](req, res, proxyRes, options);
        };
        proxyRes.pipe(gunzip).pipe(transform).pipe(gzip).pipe(mock_res).pipe(res);
      } else {
        const options = {};
        for(var i=0; i < web_o.length; i++) {
            web_o[i](req, res, proxyRes, options);
        };
        proxyRes.pipe(res);
      }

      proxyRes.on('end', (data) => {
        console.log("ProxyRes  Ended");
      });
});


const server = http.createServer((req, res) => {
    console.log("Proxying Request to specified origin.");

    req.shortId = shortId.generate();

    const target = req.headers["target"];
    if (!target) {
        res.writeHead(400, {
            'Cache-control': 'no-cache, no-store'
        });
        res.end("Bad Request. Unspecified Target.");
        return;
    } 

    try {
        const proxyOptions = {
            target,
            secure: false,
            changeOrigin: true
        }
        proxy.web(req, res, proxyOptions);
    } catch (err) {
        res.writeHead(500, {
            'Cache-control': 'no-cache, no-store'
        });
        res.end("Internal Server Error.");
        return;
    } 
    
});

server.listen(9005, () => {
    console.log('Now listening on port 9005.')
    process.on('SIGINT', function() {
        server.close(function() {
            process.exit();
        })
    });
});