(function(){
    // TODO(nathan) settings page with signins
    // TODO(nathan) goodreads stuff

    // A javascript port of the python function

    // TODO(nathan) need code to read from the local db in the client context...

    function urlencode(args) {
        return (_.map(
            args,
            function(val, key) {
                return encodeURIComponent(key) + '=' + encodeURIComponent(val);
            })).join('&');
    }

    function sync_with_server_login() {
        /* $.ajax({
            'url' : '127.0.0.1:5000/'
        }); */
    }

    function sync_with_sessionid(sessionid) {
        if (sessionid == null) {
            return;
        }

        // X-Requested-With:XMLHttpRequest
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

    function sync_book_with_fragment_map(headers, book, data) {
        data = $.parseJSON(data.match(/{.*}/)[0]);
        var fragments = data['fragmentArray'];
        // TODO(nathan) sometimes cPos is undefined
        var last_position = fragments[fragments.length]['cPos'];

        /* var url;
        if (last_position >= ) {
            url = '127.0.0.1:5000/update/' + book.asin + '/done/';
        } else {
            url = '127.0.0.1:5000/update/' + book.asin + '/progress/' + percent;
        }

        $.ajax({
            'url' : url,
        }); */
    }

    function sync_book_with_userdata(headers, book, data) {
        book.fragments_url = data['fragmentMapUrl'];
        book.last_page_read = data['lastPageReadData'];

        console.log(book.last_page_read);

        $.ajax({
            'url' : book.fragments_url,
            'headers' : headers,
            'dataType' : 'text',
            'success' : function(data) {
                sync_book_with_fragment_map(headers, book, data);
            }
        });

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
        if (sender.tab.url ==
                chrome.extension.getURL("_generated_background_page.html")) {
            $iframe = $('#' + request.id);
            callback = $iframe.data('callback');
            $iframe.unload();
            callback(request.value);
        }
        sendResponse({});
    }

    chrome.extension.onMessage.addListener(get_from_websql_callback);

    chrome.alarms.onAlarm.addListener(sync);
    chrome.alarms.create('sync', {
        'periodInMinutes' : 60,
        'when' : Date.now()
    });

    console.log('Loaded.');
})();

