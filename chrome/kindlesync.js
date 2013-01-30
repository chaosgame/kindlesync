(function(){
    // TODO(nathan) settings page with signins
    // TODO(nathan) add a button too?
    // TODO(nathan) track changes and only update on change

    function urlencode(args) {
        return (_.map(
            args,
            function(val, key) {
                return encodeURIComponent(key) + '=' + encodeURIComponent(val);
            })).join('&');
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
            book.last_page = data['endPosition'];
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
        var other_last_page = fragments[fragments.length - 1]['cPos'];

        if (book.last_page == null || other_last_page < book.last_page) {
            book.last_page = other_last_page;
        }

        sync_book_with_data(headers, book);
    }

    function sync_book_with_data(headers, book) {
        localStorage.setItem(book.asin, JSON.stringify(book));
        localStorage.setItem(book.asin + "." + book.sync_time, book.last_page_read);
    }

    function sync_book_with_userdata(headers, book, data) {
        var last_page_read = data['lastPageReadData'].position;
        var sync_time = data['lastPageReadData'].syncTime;

        if (last_page_read <= 0) {
            return;
        }

        var cached_book = localStorage.getItem(book.asin);
        if (cached_book != null) {
            cached_book = JSON.parse(cached_book);

            if (sync_time <= cached_book.sync_time) {
                return;
            }

            cached_book.last_page_read = last_page_read;
            cached_book.sync_time = sync_time;
            sync_book_with_data(headers, cached_book);

        } else {
            book.fragments_url = data['fragmentMapUrl'];
            book.metadata_url = data['metadataUrl'];
            book.last_page_read = last_page_read;
            book.sync_time = sync_time;

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

