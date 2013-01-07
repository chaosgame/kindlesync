(function(){
    // TODO(nathan) settings page with signins
    // TODO(nathan) goodreads stuff

    // A javascript port of the python function

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
            'x-amzn-sessionid' : sessionid.value
        };

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

    }

    function sync_book_with_userdata(headers, book, data) {
        book.fragments_url = data['fragmentMapUrl'];
        book.last_page_read = data['lastPageReadData'];

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

    chrome.alarms.onAlarm.addListener(sync);
    chrome.alarms.create('sync', {
        'periodInMinutes' : 60,
        'when' : Date.now()
    });
    console.log('Loaded.');
})();

