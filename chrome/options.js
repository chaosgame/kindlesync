(function(){
    function authenticated_callback(resp) {
        console.log(resp);
        if (resp) {
            $("#unauthenticated").hide();
            $("#authenticated").show();
        } else {
            $("#unauthenticated").show();
            $("#authenticated").hide();
        }
    }
    chrome.extension.sendMessage("authenticated", authenticated_callback);
})();
