(function(){
    var VERSION = 2;

    function urlencode(args) {
        return (_.map(
            args,
            function(val, key) {
                return encodeURIComponent(key) + '=' + encodeURIComponent(val);
            })).join('&');
    }

    Date.prototype.toISODate = function() {
        function add_zero(n) {
            return ( n < 0 || n > 9 ? "" : "0" ) + n;
        }

        return this.getFullYear() + '-' + add_zero(this.getMonth() + 1) + '-'
            + add_zero(this.getDate()) + 'T' + add_zero(this.getHours()) + ':'
            + add_zero(this.getMinutes()) + ':' + add_zero(this.getSeconds()) + '.000Z';
    }

    function azurlencode(args) {
        args['AssociateTag'] = localStorage['aws_tag'];
        args['AWSAccessKeyId'] = localStorage['aws_key'];
        args['Timestamp'] = (new Date()).toISOString();
        args['Service'] = 'AWSECommerceService';

        var message_args = _.map(args,
            function(val, key) {
                return encodeURIComponent(key) + '=' + encodeURIComponent(val);
            });
        message_args.sort();
        message_args = message_args.join('&');

        var message = "GET\necs.amazonaws.com\n/onca/xml\n" + message_args;

        var messageBytes = str2binb(message);
        var secretBytes = str2binb(localStorage['aws_secret']);

        if (secretBytes.length > 16) {
            secretBytes = core_sha256(secretBytes, localStorage['aws_secret'].length * chrsz);
        }

        var ipad = Array(16), opad = Array(16);
        for (var i = 0; i < 16; i++) {
            ipad[i] = secretBytes[i] ^ 0x36363636;
            opad[i] = secretBytes[i] ^ 0x5C5C5C5C;
        }

        var imsg = ipad.concat(messageBytes);
        var ihash = core_sha256(imsg, 512 + message.length * chrsz);
        var omsg = opad.concat(ihash);
        var ohash = core_sha256(omsg, 512 + 256);

        var b64hash = binb2b64(ohash);
        args['Signature'] = b64hash;

        return "http://ecs.amazonaws.com/onca/xml?" + urlencode(args);
    }

    function sync_with_sessionid(sessionid) {
        if (sessionid == null) {
            return;
        }

        var headers = {
            'x-amzn-sessionid' : sessionid.value,
            'X-Requested-With' : 'XMLHttpRequest',
            'Referrer' : 'http://read.amazon.com',
            'Pragma' : 'no-cache',
            'Cache-Control' : 'no-cache'
        };

        get_from_websql('kindleDeviceToken', function(deviceToken) {
            if (deviceToken) {
                headers['X-ADP-Session-Token'] = deviceToken;
                sync_with_headers(headers);
            }
        });
    }

    function sync_with_headers(headers) {
        if (!('X-ADP-Session-Token' in headers)) {
            $.ajax({
                'url' : ('https://read.amazon.com/service/web/register/getDeviceToken?' +
                    urlencode({
                        'serialNumber' : 'A2CTZ977SKFQZY',
                        'deviceType' : 'A2CTZ977SKFQZY'
                    })),
                'headers' : headers,
                'async' : false,
                'dataType' : 'json',
                'success' : function(data) {
                    headers['X-ADP-Session-Token'] = data['deviceSessionToken'];
                }
            });
        }

        var books;
        $.ajax({
            'url' : 'https://read.amazon.com/service/web/reader/getOwnedContent',
            'headers' : headers,
            'async' : false,
            'dataType' : 'json',
            'success' : function(data) {
                books = data['asinsToAdd'];
            }
        });

        _.each(books, function(book) {
            sync_book(headers, book);
        });
    }

    function sync_book_with_metadata(headers, book, data) {
        data = $.parseJSON(data.match(/{.*}/)[0]);

        if ('endPosition' in data) {
            book.last_pos = data['endPosition'];
        }

        $.ajax({
            'url' : book.fragments_url,
            'headers' : headers,
            'dataType' : 'text',
            'success' : function(data) {
                sync_book_with_fragment_map(headers, book, data);
            }
        });
    }

    function sync_book_with_fragment_map(headers, book, data) {
        data = $.parseJSON(data.match(/{.*}/)[0]);
        var fragments = data['fragmentArray'];
        var other_last_pos = fragments[fragments.length - 1]['cPos'];

        if (book.last_pos == null || other_last_pos < book.last_pos) {
            book.last_pos = other_last_pos;
        }

        $.ajax({
            'url' : azurlencode({
                'Operation' : 'ItemLookup',
                'ResponseGroup' : 'ItemAttributes',
                'ItemId' : book.asin
            }),
            'dataType' : 'xml',
            'success' : function(data) {
                sync_book_with_associate_data(headers, book, data);
            },
            'error' : function(rq, code, error) {
                if (rq['status'] == 403) {
                    localStorage['aws_broken'] = true;
                }
            }
        });
    }

    function sync_book_with_associate_data(headers, book, data) {
        book.num_pages = $(data).find('NumberOfPages').text();
        sync_book_with_data(headers, book);
    }

    function sync_book_with_data(headers, book) {
        localStorage.setItem(book.asin, JSON.stringify(book));
        localStorage.setItem(book.asin + "." + book.sync_time, book.last_pos_read);
    }

    function sync_book_with_userdata(headers, book, data) {
        var last_pos_read = data['lastPageReadData'].position;
        var sync_time = data['lastPageReadData'].syncTime;

        if (last_pos_read <= 0) {
            return;
        }

        var cached_book = localStorage.getItem(book.asin);
        if (cached_book != null) {
            cached_book = JSON.parse(cached_book);
        }

        if (cached_book != null &&
            cached_book.version != null &&
            cached_book.version == VERSION) {

            if (sync_time <= cached_book.sync_time) {
                return;
            }

            cached_book.last_pos_read = last_pos_read;
            cached_book.sync_time = sync_time;
            sync_book_with_data(headers, cached_book);

        } else {
            book.fragments_url = data['fragmentMapUrl'];
            book.metadata_url = data['metadataUrl'];
            book.last_pos_read = last_pos_read;
            book.sync_time = sync_time;
            book.version = VERSION;

            $.ajax({
                'url' : book.metadata_url,
                'headers' : headers,
                'dataType' : 'text',
                'success' : function(data) {
                    sync_book_with_metadata(headers, book, data);
                }
            });
        }
    }

    function sync_book(headers, book) {
        $.ajax({
            'url' : ('https://read.amazon.com/service/web/reader/startReading?' +
                urlencode({
                    'asin' : book.asin,
                    'isSample' : 'false',
                    'clientVersion' : '10403026'
                })),
            'headers' : headers,
            'dataType' : 'json',
            'success' : function(data) {
                sync_book_with_userdata(headers, book, data);
            }
        });
    }

    function sync() {
        console.log('Syncing.');

        if (!localStorage['aws_key'] ||
            !localStorage['aws_secret'] ||
            !localStorage['aws_tag'] ||
             localStorage['aws_brokwn'] == 'true') {
            console.log('Invalid Amazon API token');
            return;
        }

        chrome.cookies.get({
            'url' : 'http://amazon.com',
            'name' : 'session-id'
        }, sync_with_sessionid);
    }

    websql_id = 1;
    function get_from_websql(key, callback) {
        $('body').append($('<iframe/>', {
                'src' :
                    'https://read.amazon.com/static/app/getFromWebSql.html?' +
                    urlencode({ 'key' : key, 'id' : "websql-" + websql_id }),
                'id' : "websql-" + websql_id
            }).data('callback', callback));
        websql_id++;
    }

    function get_from_websql_callback(request, sender, sendResponse) {
        $iframe = $('#' + request.id);
        callback = $iframe.data('callback');
        $iframe.unload();
        callback(request.value);
    }

    function options_callback(request, sender, sendResponse) {
        if (request == "authenticated") {
            chrome.cookies.get({
                'url' : 'http://amazon.com',
                'name' : 'session-id'
            }, function (sessionid) {
                sendResponse(sessionid != null);
            });
        } else if (request == "last_synced") {
            sendResponse(0);
        } else {
            sendResponse({});
        }
    }

    function on_message_callback(request, sender, sendResponse) {
        if (sender.tab.url ==
                chrome.extension.getURL("_generated_background_page.html")) {
            get_from_websql_callback(request, sender, sendResponse);
        } else if (sender.tab.url ==
                chrome.extension.getURL("options.html")) {
            options_callback(request, sender, sendResponse);
        } else {
            sendResponse({});
        }
        return true;
    }

    chrome.extension.onMessage.addListener(on_message_callback);

    chrome.alarms.onAlarm.addListener(sync);
    chrome.alarms.create('sync', {
        'periodInMinutes' : 15,
        'when' : Date.now()
    });

    // Have code run when installed...
    console.log('Loaded.');
})();

