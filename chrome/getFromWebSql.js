(function(key, id) {
    var db = openDatabase('K4W', '', 'Kindle Cloud Reader', 5e6);
    db.transaction(function (tx) {
        tx.executeSql(
            "SELECT value FROM keyValue WHERE key = '" + key + "'",
            [],
            function (tx, results) {
                var message = {
                    'source' : 'getFromWebSql',
                    'key' : key,
                    'id' : id,
                    'value' : null
                };
                if (results.rows.length == 1) {
                    message['value'] = results.rows.item(0).value;
                }
                chrome.runtime.sendMessage(
                    message,
                    function(r) { }
                );
            });
        });
})(document.URL.match(/key=(\w*)/)[1], document.URL.match(/id=(websql-[0-9]*)/)[1]);
