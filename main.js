
window.onload = function () {

    var params = new URLSearchParams(window.location.search);
    
    if (params.has("c") == true) {
      backcode = params.get("c");
    } else {
      backcode = "DiX8RfuZzreVQx9L_5Z5ie4Hx6MIhY1pmGbVV4lQvSq5Zx52icH8mBl2BLOEx2EIxSreXGtpBKYZgCH6zABvHMoyxVCfksNBi9hAzbDpOhCOGgof4cQbHBkiQVQ2McEAyB-DAOBen5tjBrvi8LLs_Z-L13Xb6afilMXKFXOlwLoxGU_2M667u52MAHRVvgqVH3hB3NLq5tqMwxyNgtACyRGZcDEIhbZx03BZvZE1UZrsSYy5tg42ht9MjcJiuLJEdTnOcCUHS7Bjd-4VhzjeeoHVDccFz5f1mZnAtTzEwY5mkHUDEwkHDUKUxSwitbST036lufEO51DnoJ4m0TV3Htfx4_g5B95HhojqOjfud5l50_fTeJ49NH_dfiIeIA8ByOAhs3htmNIQQiaToSicNb5K6oouJQd3Xipa49cOG1DyoDYT";
    }
    
    // "DiX8ReaZzrfpP4jxuH4JVY0ne47QHoZ"をデコードする
    const moji=URLCompressor.expand(backcode);

    console.log(moji)
    
    let kitte = moji;
    let kitta = kitte.split('^=~');
    
    var target = document.getElementById("custom");
    target.innerHTML = kitta[0];
    
    var target = document.getElementById("title");
    target.innerHTML = kitta[1];
    
    var target = document.getElementById("ninsyo1");
    target.innerHTML = kitta[2];

    var target = document.getElementById("ninsyo2");
    target.innerHTML = kitta[2];
    
    var target = document.getElementById("nourl");
    document.getElementById('btn1').innerHTML = '<a href="'+kitta[3]+'" style = "color:#fff; text-decoration: none; display: block;">はい</a>'
    
    var target = document.getElementById("yesurl");
    document.getElementById('btn2').innerHTML = '<a href="'+kitta[4]+'" style = "color:#000; text-decoration: none; display: block;">いいえ</a>'
    
    }