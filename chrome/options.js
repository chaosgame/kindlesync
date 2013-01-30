(function(){
    function authenticated_callback(authenticated) {
        if (!authenticated) {
            $("#sync").show();
            $("#unauthenticated").show();
        } else {
            var i, len = localStorage.length;
            for (i = 0; i < len; ++i) {
                var asin = localStorage.key(i)

                if (asin.search(/\./) >= 0) {
                    continue;
                }

                var book = JSON.parse(localStorage[asin]);
                var percent = Math.round(10000. * book.last_page_read / book.last_page) / 100;
                var author = book.authors ? book.authors[0] : "";
                var date = (new Date(book.sync_time)).toDateString();

                var $tr = $('<div class="book">');
                $tr.append('<div class="title">' + book.title + '</div>');
                $tr.append('<div class="author">' + author + '</div>');
                $tr.append('<div class="progress">' + percent + '%</div>');
                $tr.append('<div class="synctime">' + date + '</div>');

                console.log(book);

                $("#books").append($tr);
            }
        }
    }
    chrome.extension.sendMessage("authenticated", authenticated_callback);
})();
