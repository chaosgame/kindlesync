function authenticated_callback(authenticated) {
    if (!authenticated) {
        $("#unauthenticated").show();
    } else {
        var i, len = localStorage.length;
        for (i = 0; i < len; ++i) {
            var asin = localStorage.key(i)

            if (asin.search(/\./) >= 0 || asin.substr(0,4) == 'aws_') {
                continue;
            }

            var book = JSON.parse(localStorage[asin]);
            var authors = _.map(
                book.authors,
                function(author) {
                    var names = author.split(', ', 2);
                    return names[1] + ' ' + names[0];
                }).join(', ');

            var current_page = Math.round(book.last_pos_read / book.last_pos * book.num_pages);
            var percent = Math.round(100. * current_page / book.num_pages);

            var date = (new Date(book.sync_time)).toDateString();

            var $tr = $('<div class="book">');
            $tr.append('<div class="title">' + book.title + '</div>');
            $tr.append('<div class="author">' + authors + '</div>');
            $tr.append('<div class="progress">' + percent + '%</div>');
            $tr.append('<div class="currentpage">' + current_page + '/' + book.num_pages + '</div>');
            $tr.append('<div class="synctime">' + date + '</div>');
            $tr.append('<div class="clear">');

            $tr.data('raw', {
                'author' : book.authors[0],
                'progress' : percent,
                'synctime' : book.sync_time
            });

            $("#books").append($tr);
        }
    }
}

chrome.extension.sendMessage("authenticated", authenticated_callback);

function sort(field) {
    _.each($('.book').sort(function(a, b) {
        a = $(a).data('raw')[field];
        b = $(b).data('raw')[field];
        if (a == b) {
            return 0;
        } else if (a < b) {
            return 1;
        } else {
            return -1;
        }
    }), function(a) {
        $('#books').append(a);
    });
}

$(function() {
    $("#author").click(function(e) {
        sort('author');
    });

    $("#progress").click(function(e) {
        sort('progress');
    });

    $("#synctime").click(function(e) {
        sort('synctime');
    });

    $("input").focus(function(e) {
        if ($(this).attr('value') ==  '(' + $(this).attr('id') + ')') {
            $(this).attr('value', '');
        }
    });

    $("input").blur(function(e) {
        if ($(this).attr('value') == '') {
            $(this).attr('value', '(' + $(this).attr('id') + ')');
        }
    });

    $("#apiupdate").click(function(e) {
        _.each(['key', 'secret', 'tag'], function(field) {
            if ($('#' + field).attr('value') != '(' + field + ')') {
                console.log('aws_' + field + ' = ' + $('#' + field).attr('value'));
                localStorage['aws_' + field] = $('#' + field).attr('value');
            }
        });
        localStorage['aws_broken'] = false;
    });


    if (!localStorage['aws_key'] ||
        !localStorage['aws_secret'] ||
        !localStorage['aws_tag'] ||
         localStorage['aws_broken'] == 'true') {
         $("#noapikey").show();

         // TODO(nathan) make this go green after we update
    }

    _.each(['key', 'secret', 'tag'], function(field) {
        if (localStorage['aws_' + field]) {
            $('#' + field).attr('value', localStorage['aws_' + field]);
        }
    });
});

