var mode = "extension"; //or "bookmarklet"

//*************COLOR FUNCTIONS
function rgb2hex(rgb) {
  rgb = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
  return "#" +
      ("0" + parseInt(rgb[1], 10).toString(16)).slice(-2) +
      ("0" + parseInt(rgb[2], 10).toString(16)).slice(-2) +
      ("0" + parseInt(rgb[3], 10).toString(16)).slice(-2);
}

function rgba2hex(rgb) {
  rgb = rgb.match(/^rgba\((\d+),\s*(\d+),\s*(\d+),\s*(\d+)\)$/);
  return "#" +
      ("0" + parseInt(rgb[1], 10).toString(16)).slice(-2) +
      ("0" + parseInt(rgb[2], 10).toString(16)).slice(-2) +
      ("0" + parseInt(rgb[3], 10).toString(16)).slice(-2);
}

function convertRGBAndDesaturate(rgbString) {
  var hexString = rgb2hex(rgbString).split("#")[1],
      lessColor = new less.tree.Color(hexString),
      desaturatedLessColor;

  desaturatedLessColor = less.tree.functions.desaturate(lessColor, {"value":100});
  return desaturatedLessColor.toCSS();
}

function convertRGBAndDesaturateLessColor(rgbString) {
  var hexString = rgb2hex(rgbString).split("#")[1],
      lessColor = new less.tree.Color(hexString),
      desaturatedLessColor;

  desaturatedLessColor = less.tree.functions.desaturate(lessColor, {"value":100});
  return desaturatedLessColor;
}

function convertPixelColor(pixels, colorChoice) {
  for (var i = 0, il = pixels.length; i < il; i += 4) {
    var rgbString = "rgb(" + pixels[i] + ", " + pixels[i + 1] + ", " + pixels[i + 2] + ")";
    var lessDesaturated = convertRGBAndDesaturateLessColor(rgbString);
    pixels[i] = lessDesaturated.rgb[0];
    pixels[i + 1] = lessDesaturated.rgb[1];
    pixels[i + 2] = lessDesaturated.rgb[2];
  }
}
//*************END COLOR FUNCTIONS

//*************PROCESSING FUNCTIONS
function convertRemoteCSSFileToLocal() {
  if(mode !== "extension") {
    return false;
  }

  console.log("Importing remote stylesheets");
  console.log("Total Stylesheets: " + document.styleSheets.length);
  jQuery(document.styleSheets).each(function (ssIndex, ss) {
    if (ss.rules) { return; }
    debugger;

    chrome.extension.sendMessage({name:"getStyleSheet", href: ss.href}, function(response) {
      debugger;
      console.log("Received a response for stylesheet " + ssIndex);
      //console.log(response);
      if(response.rules) {
        //cannot append to a cross-origin stylesheet, so need to create a new stylesheet
        var newStyleElement = document.createElement('style');
        document.getElementsByTagName('head')[0].appendChild(newStyleElement);
        var newStyleSheet = document.styleSheets[document.styleSheets.length - 1];
        jQuery(response.rules).each(function(ruleIndex, cssText) {
          if(!cssText) {
            return true;
          }
          newStyleSheet.insertRule(cssText, ruleIndex);
        });
        console.log("Done importing remote stylesheet " + ssIndex);
      }
    });
    console.log("Sent a request for stylesheet " + ssIndex);
  });
}

//CSS FILES
function processCSS() {
  console.log("Processing CSS");
  console.log("Total Stylesheets: " + document.styleSheets.length);
  jQuery(document.styleSheets).each(function (ssIndex, ss) {
    if (!ss.rules) { return; }
    console.log("Stylesheet " + ssIndex + " has " + ss.rules.length + " CSS rules defined");
    jQuery(ss.rules).each(function (index, cssRule) {
      var cssText = cssRule.cssText;
      var newCssText = cssText.replace(/rgb\((\d+),\s(\d+),\s(\d+)\)/g, convertRGBAndDesaturate);
      if (cssText !== newCssText) {
        ss.deleteRule(index);
        ss.insertRule(newCssText, index);
        //console.log(newCssText);
      }
    });
  });
  console.log("Done Processing CSS");
}

//IMAGES
function processImages() {
  console.log("Amount of images: " + jQuery("img").length);
  var wrapperEl, canvasEl, context;
  jQuery("img").each(function (index, curImg) {
    if(mode === "extension"){
      canvasEl = jQuery("<canvas/>", {})[0];
      jQuery(curImg).after(canvasEl);
      jQuery(canvasEl).copyCSS(curImg);
      var imageObj = new Image();
      (function(canvasElement, displayedWidth, displayedHeight) {
        imageObj.onload = function () {
          //set the canvas width and height to the natural size of the image, so the image takes up the entire canvas
          canvasElement.height = imageObj.height;
          canvasElement.width = imageObj.width;
          var context = canvasElement.getContext("2d");
          context.drawImage(imageObj, 0, 0);
          var imageData = context.getImageData(0, 0, imageObj.width, imageObj.height);
          var pixels = imageData.data;

          convertPixelColor(pixels);

//          for (var i = 0, il = pixels.length; i < il; i += 4) {
//            var rgbString = "rgb(" + pixels[i] + ", " + pixels[i + 1] + ", " + pixels[i + 2] + ")";
//            var lessDesaturated = convertRGBAndDesaturateLessColor(rgbString);
//            pixels[i] = lessDesaturated.rgb[0];
//            pixels[i + 1] = lessDesaturated.rgb[1];
//            pixels[i + 2] = lessDesaturated.rgb[2];
//          }

          context.putImageData(imageData, 0, 0);
          //set the canvas css size to the originally displayed size of the image
          jQuery(canvasElement).css("width",displayedWidth);
          jQuery(canvasElement).css("height",displayedHeight);
        };
      })(canvasEl, jQuery(curImg).width(), jQuery(curImg).height());

     //Instead of setting the source directly on the image object, lets use a chrome background page to get the data url
     //This prevents the issue with cross domain problems since a chrome extension background script does not
     //adhere to the same security constraints.
     debugger;
     chrome.extension.sendMessage({name:"getDataUrl", imageSrc: jQuery(curImg).attr("src")}, function(response) {
        imageObj.src = response.dataUrl;
     });

    }
    jQuery(curImg).remove();
  });
}

//CSS BACKGROUND IMAGES
function processCSSImages() {
  var totalRules = 0, cssWithBGImageMatchArray = [], styleSheetsProcessed = 0;
  jQuery(document.styleSheets).each(function (ssIndex, ss) {
    jQuery(ss.rules).each(function (index, cssRule) {
      var cssText = cssRule.cssText;
      if (cssRule.cssText && cssText.indexOf("background-image: url") !== -1) {
        console.log(ssIndex + " BG Image: " + cssText);
        //Reasons to ignore this entry in the stylesheet
        //malformed css declaration
        var bracketIndex = cssText.indexOf("{");
        if (bracketIndex === -1) {
          return true; //
        }
        //this selector doesn't exist in the current page
        var cssSelectors = cssText.substring(0, bracketIndex).split(","), foundAny = false;
        jQuery.each(cssSelectors, function(index, cssSelector) {
          if (jQuery(cssSelector.trim()).length > 0) {
            foundAny = true;
            return false;
          }
        });
        if (!foundAny) {
          return true;
        }
        //this selector doesn't exist in the current page
        var cssBGImageMatch = cssText.match(/background-image: url\(([^)]+)\)/);
        if (!cssBGImageMatch || cssBGImageMatch.length < 2) {
          return true;
        }

        //css selector found something on the page and the definition has a background image
        var cssBGImage = cssBGImageMatch[1];
        console.log(cssText);
        var found = false;
        jQuery(cssWithBGImageMatchArray).each(function (index, matchObj) {
          if (matchObj.cssBGImage === cssBGImage) {
            matchObj.cssTexts.push(cssText);
            found = true;
            return false;
          }
        });
        //image is not already in the array, so creating a new entry for it
        if (!found) {
          var cssWithBGImageMatch = {
            cssTexts:[cssText],
            cssBGImage:cssBGImage
          };
          cssWithBGImageMatchArray.push(cssWithBGImageMatch);
        }


      }
    });
    styleSheetsProcessed++;
  });
  console.log("SS Processed: " + styleSheetsProcessed);
  console.log(cssWithBGImageMatchArray);
  debugger;
  jQuery(cssWithBGImageMatchArray).each(function (index, matchObj) {
		if(mode === "extension") {
      var imageObj = new Image();
      (function(matchObject) {
        var canvasEl = jQuery('<canvas/>'),
            context = canvasEl[0].getContext("2d");
        imageObj.onload = function () {
          var width = imageObj.width,
              height = imageObj.height;
          jQuery(canvasEl).attr("width", width);
          jQuery(canvasEl).attr("height", height);
          context.drawImage(imageObj, 0, 0);
          var imageData = context.getImageData(0, 0, width, height);
          console.log("CSS BG - W/H: " + width + " / " + height);
          var pixels = imageData.data;

          for (var i = 0, il = pixels.length; i < il; i += 4) {
            var rgbString = "rgb(" + pixels[i] + ", " + pixels[i + 1] + ", " + pixels[i + 2] + ")";
            var lessDesaturated = convertRGBAndDesaturateLessColor(rgbString);
            pixels[i] = lessDesaturated.rgb[0];
            pixels[i + 1] = lessDesaturated.rgb[1];
            pixels[i + 2] = lessDesaturated.rgb[2];
          }
          //set the canvas dimensions before putting the image data in so the size matches up
          jQuery(canvasEl).attr("width", width);
          jQuery(canvasEl).attr("height", height);
          context.putImageData(imageData, 0, 0, 0, 0, width, height);
          //get the data url and
          var dataUrl = canvasEl[0].toDataURL();

          //go through the css rules that have this image, replace the image, and insert the new rule
          jQuery.each(matchObject.cssTexts, function (jindex, cssText) {
            var newCSSText = cssText.replace(/background-image: url\(([^)]+)\)/, "background-image: url(\"" + dataUrl + "\")");
            //console.log("Inserting newCSSText", newCSSText);
            document.styleSheets[document.styleSheets.length-1].insertRule(newCSSText, document.styleSheets[document.styleSheets.length-1].rules.length);
          });
        };
      }(matchObj));

      //Instead of setting the source directly on the image object, lets use a chrome background page to get the data url
      //This prevents the issue with cross domain problems since a chrome extension background script does not
      //adhere to the same security constraints.
//      debugger;
      chrome.extension.sendMessage({name:"getDataUrl", imageSrc: matchObj.cssBGImage}, function(response) {
        imageObj.src = response.dataUrl;
      });

		}
		
    //REGEX Explanation:
    //match a string starting with "background-image: url(".
    //the next paran denotes the start of the backreference that we want to start extracting the insides to save the url
    //inside the square brackets gives us any character up to the next closing paren which is the end of the url
    //the backreference is then closed
    //the regex is stopped at the closing ");"
    //console.log(cssText.match( /background-image: url\(([^)]+)\);/ ));
  });
}
//*************END PROCESSING FUNCTIONS

function loadScript(url, callback) {

  var script = document.createElement("script");
  script.type = "text/javascript";

  if (script.readyState) {  //IE
    script.onreadystatechange = function () {
      if (script.readyState === "loaded" ||
          script.readyState === "complete") {
        script.onreadystatechange = null;
        callback();
      }
    };
  } else {  //Others
    script.onload = function () {
      callback();
    };
  }

  script.src = url;
  document.getElementsByTagName("head")[0].appendChild(script);
}

function startProcessing() {
  jQuery('iframe, embed').remove();

  convertRemoteCSSFileToLocal();
  debugger;
  console.log("--------------");
  processCSS();
  debugger;
  console.log("--------------");
  processImages();
  debugger;
  console.log("--------------");
  processCSSImages();
  console.log("--------------");
}

(function () {
  debugger;
  var lessLoaded = false, jqueryLoaded = false;

  //LESS
  loadScript('https://lesscss.googlecode.com/files/less-1.3.0.min.js', function () {
//    debugger;
    lessLoaded = true;
    if (jqueryLoaded) {
      console.log("LESS and jquery loaded");
      jQuery(function () {
        //JQUERY CSS COPY PLUGIN
        loadScript('https://raw.github.com/moagrius/copycss/master/jquery.copycss.js', function () {
          startProcessing();
        });
      });
    }
  });

  //JQUERY
  loadScript('https://ajax.googleapis.com/ajax/libs/jquery/1.7.1/jquery.min.js', function () {
//    debugger;
    jqueryLoaded = true;
    if (lessLoaded) {
      console.log("less and JQUERY loaded");
      jQuery(function () {
        //JQUERY CSS COPY PLUGIN
        loadScript('https://raw.github.com/moagrius/copycss/master/jquery.copycss.js', function () {
          startProcessing();
        });
      });
    }
  });


}());