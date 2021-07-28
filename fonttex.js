// FontTeX
// Written by Christian Figueroa <figgchristian@gmail.com>

// TODO: add \widehat, \widetilde, and \vec
// TODO: add \underbrace

window.fontTeX = (function() {
    "use strict";
    // FontTeX is based more on plain TeX than LaTeX to mimic all the low-level mechanics instead of
    // trying to conform to a LaTeX's higher level nuances.
  
    const version = "0.5.1"; // Version of FontTeX
  
    const ftattr = "data-fonttex"; // Prefix of all FontTeX-related element attributes
  
    // Generates a random 32-digit hexadecimal number to use as a UUID. It prefers to use `crypto` to
    // get cryptographically random numbers, but falls back to `Math.random`.
    function make_uuid() {
      let crypto = window.crypto || window.msCrypto;
      let bytes = crypto && crypto.getRandomValues ?
        crypto.getRandomValues(new Uint8Array(16)) :
        (new Uint8Array(16)).map(() => Math.floor(Math.random() * 256));
      return Array.from(bytes).map(byte => (0x100 + byte).toString(16).substring(1)).join("");
    }
  
    // Removes single or double quotes from around a string if it has any.
    function stripQuotes(string) {
      return (string[0] == '"' && string[string.length - 1] == '"') ||
        (string[0] == "'" && string[string.length - 1] == "'") ?
        string.substring(1, string.length - 1) :
        string;
    }
  
    // Catcodes determine how a character should be read. By default, these are the main ones:
    // \ => ESCAPE (0)
    // { => OPEN (1)
    // } => CLOSE (2)
    // $ => MATHSHIFT (3)
    // & => ALIGN (4)
    // U+000A => ENDOFLINE (5)
    // # => PARAMETER (6)
    // ^ => SUPERSCRIPT (7)
    // _ => SUBSCRIPT (8)
    // U+0000 => IGNORE (9)
    // U+0009 => WHITESPACE (10)
    // U+0020 => WHITESPACE (10)
    // a-z => LETTER (11)
    // A-Z => LETTER (11)
    // ~ => ACTIVE (13)
    // % => COMMENT (14)
    // U+007F => INVALID (15)
    // Everything else => OTHER (12)
    const catcodes = {
      ESCAPE: 0, // Begins a command name, like \TeX or \def.
      OPEN: 1, // Begins a new group, as in { ... }.
      CLOSE: 2, // Closes a group started by OPEN.
      MATHSHIFT: 3, // Indicates the start or end of a string of math, as in $ ... $.
      ALIGN: 4, // Used in \halign to separate cells.
      ENDOFLINE: 5, // Ends a line of input and determines where a comment should be terminated.
      PARAMETER: 6, // Used in \def to indicate parameters aand \halign to indicate cell content.
      SUPERSCRIPT: 7, // Indicates that the following token should be rendered as a superscript.
      SUBSCRIPT: 8, // Indicates that the following token should be rendered as a subscript.
      IGNORE: 9, // Completely ignored in the input.
      WHITESPACE: 10, // Indicates space that can be ignored after a command.
      LETTER: 11, // Same as OTHER, but rendeered in italics by default.
      OTHER: 12, // Shown as plain characters without any special formatting.
      ACTIVE: 13, // Treated as a command that may expand to other tokens.
      COMMENT: 14, // Indicates the start of a comment that spans until the next ENDOFLINE character.
      INVALID: 15 // Shows as an error in the output.
    };
  
    // Each atom gets an atom type that determins the spacing between them. This allow 1+1 to show up
    // with spaces around the +, but 121 to show as a regular number without spacing in betweem.
    const atomTypes = {
      ORD: 0, // ORDinary atoms (the default)
      OP: 1, // OPerator atoms like "max" or a summation sigma character.
      BIN: 2, // BINary operator that connects two operands, like + or -.
      REL: 3, // Binary RELation that relates both sides of a formula, like =.
      OPEN: 4, // Indicates the start of a subgroup like \left( ... \right).
      CLOSE: 5, // Indicates the end of a subgroup like \left( ... \right).
      PUNCT: 6, // PUNCTuation that has some spacing following it, like . or ,.
      VARIABLE: 7,
      ACTIVE: 8,
      INNER: "inner",
      OVER: "over",
      UNDER: "under",
      VCENT: "vcent",
      RAD: "rad",
      ACC: "acc"
    };
  
    const root2 = Math.SQRT2;
    const rootHalf = Math.SQRT1_2;
    const rootHalfEm = `${rootHalf}em`;
  
    // Beginning of the object to export.
    let fontTeX = {
      version: version
    };
    
    // Used to change certain aspects of FontTeX's behavior. Look at the `settings` object defined af-
    // ter this for a list of options and their default values.
    // Has a few different variations of invoking:
    // No arguments - Returns a JSON object with all the key-value pairs of the settings.
    // One string argument - Returns the associated value of the setting with the specified key.
    // One string argument and one other argument - Sets the setting with the key as the first argu-
    //    mentand the value as the second argument. Returns the value that the setting was set to.
    //    This may be different from the supplied argument since the argument may be translated into
    //    another type (e.g. 1 becoming a boolean would return true instead of 1).
    // One non-string argument - The argument is treated as an object and any key-value pairs in the 
    //    argument are used to set the corresponding settings. Returns a copy of the entire settings
    //    object after having been altered.
    fontTeX.config = function(name, value) {
      let keys = Object.keys(settings);
      if (typeof name == "string") {
        // One string argument, or two arguments
        name = name.toLowerCase();
        if (keys.includes(name)) {
          if (arguments.length > 1) {
            value = (settings[name][1])(value);
            // Turn (-)Infinity and NaN into 0.
            if (typeof value == "number" && !isFinite(value)) {
              value = 0;
            }
            settings[name][0] = value;
          }
          return settings[name][0];
        } else {
          // Return null for nonexistent keys
          return null;
        }
      } else {
        // No arguments, or one non-string argument
        let settingsClone = {};
        for (let i = keys.length - 1; i >= 0; i--) {
          let key = keys[i];
          // Change the value before adding it to `settingsClone`.
          if (name && key in name) {
            let value = (settings[key][1])(name[key]);
            if (typeof value == "number" && !isFinite(value)) {
              value = 0;
            }
            settings[key][0] = value;
          }
          settingsClone[key] = settings[key][0];
        }
        return settingsClone;
      }
    }
  
    // The object of possible settings that can be changed. Use the `fontTeX.config` function to
    // change these. Each value is a 2-long array with the 0th element being the defauly value for the
    // corresponding option and the 1st element being the type.
    // 
    // settings["autoupdate"] - Whether each instance of rendered TeX on the page should be automatic-
    //     ally checked and updated for style changes. This introduces an extra mutation observer that
    //     may slow down the webpage, especially if there are many instnaces of TeX renderings since
    //     each one is checked each time. Since font families don't change very often on a webpage,
    //     this is disabled by default, but can be enabled if you expect there to be changes on the
    //     page. Default: false.
    // settings["parsehtml"] - Whether HTML text should be interpreted as actual HTML tags or just
    //     plain text. If disabled, any HTML is rendered as-is, ensuring no extra HTML is injected
    //     into the page thaat you didn't mean to be there. Default: true.
    // settings["invalid.color"] - The color that invalid TeX will be highlighted in. It must be a
    //     string that represents a CSS color. Default: "red".
    // settings["radical.build"] - Whether a radical symbol should be "built" using a <canvas> (to al-
    //     low for taller or shorter symbols) or to fall back to a regular Unicode symbol (√ U+221A).
    //     More specific details and examples are described below. The artifical radical usually looks
    //     better in most cases. Default: true
    // settings["radical.w"] - One of three settings that affect how a radical symbol is drawn. View
    //     the section below titled "Radical <canvas> implenetation details" for more.
    // settings["radical.t"] - Ditto.
    // settings["radical.h"] - Ditto.
    // settings["radical.verticalthreshold"] - Ditto.
    // settings["operator.growamount"] - The scale factor used by certain operators like \sum in
    //     \displaystyle mode to make them bigger than their \textstyle mode counterparts. 1 is the
    //     normal size (no growth), less than one is shrinking, and greater than 1 is growth. Default:
    //     1.75.
    // settings["radical.growchars"] - A list of characters (in the form of a string) that will be
    //     rescaled in \displaystyle according to the scale factor in settings["operator.growamount"].
    //     Default: "⅀∏∐∑∫∮⋀⋁⋂⋃⨀⨁⨂⨃⨄⨅⨆⨉⫿"
    let settings = {
      "autoupdate": [false, Boolean],
      "parsehtml": [true, Boolean],
      "invalid.color": ["red", String],
      "radical.build": [true, Boolean],
      "radical.w": [0.5, Number],
      "radical.t": [0.15, Number],
      "radical.h": [1.25, Number],
      "radical.verticalthreshold": [2.75, Number],
      "operator.growamount": [1.75, Number],
      "operator.growchars": ["⅀∏∐∑∫∮⋀⋁⋂⋃⨀⨁⨂⨃⨄⨅⨆⨉⫿", String]
    };
  
    /************************************************************************************************
     *                       Radical <canvas> drawing implementation details                        *
     * TeX's radical symbol (from macros like \radical and \sqrt) will stretch vertically to match  *
     * the content that follows it (which allows for something like \sqrt{\frac{1}{2}} to form a    *
     * large radical symbol that encompasses the entire fraction). TeX fonts typically have special *
     * information embedded in them that allow TeX to know how to scale up a radical symbol proper- *
     * ly. Normal fonts like those used on the web don't. To compensate and still allow somewhat    *
     * reasonable-looking radical symbols to be scaled up, they are custom drawn on a <canvas>      *
     * element. Some parameters in how radicals are drawn are taken directly from the font or the   *
     * size of the radical's content. There are four more parameters that can be changed by the u-  *
     * ser, all of which are demonstrated in the following two links:                               *
     *                                                                                              *
     * https://www.desmos.com/calculator/azks7czhoq (Sloped version)                                *
     * https://www.desmos.com/calculator/rcbfdddqxj (Vertical version)                              *
     *                                                                                              *
     * If the size of the radical's content is tall enough (as determined by "verticalthreshold"),  *
     * the vertical version is used to be able to vertically scale up infinitely. The points in the *
     * Desmos drawings can be dragged and are labeled to show their corresponding option in the     *
     * `settings` object. There's a lot of math involved in making the radical symbol since there   *
     * are so many parameters to take into account, but the implementation is handled elsewhere in  *
     * this script.                                                                                 *
     ************************************************************************************************/
  
    // A function that accepts either a string, Node, NodeList, or Array and returns an Array of elem-
    // ents described by the argument.
    // A string will be treated as an argument to `querySelectorAll`.
    // An Element will return a 1-long array of just itself.
    // A NodeList/HTMLCollection will return an array of its Elements.
    // An Array will return an Array of the Elements within the original Array.
    // Anything else will return an empty Array.
    function elementList(arg) {
      if (typeof arg == "string") {
        return elementList(document.querySelectorAll(arg));
      } else if (arg instanceof Element) {
        return [arg];
      } else if (arg instanceof NodeList || arg instanceof HTMLCollection) {
        return elementList(Array.prototype.slice.call(arg));
      } else if (Array.isArray(arg)) {
        return arg.filter(item => item instanceof Element);
      } else {
        return [];
      }
    }
  
    // Similar to `elementList`, except it returns a list of `fontTeX.ParseFontTeX` instances instead
    // of Elements. Only elements with a corresponding `ParsedFontTeX` instance are used.
    function parsedFontTeXInstanceList(elements) {
      if (typeof elements == "string") {
        return parsedFontTeXInstanceList(document.querySelectorAll(elements));
      } else if (elements instanceof HTMLCollection || elements instanceof NodeList) {
        return parsedFontTeXInstanceList(Array.prototype.slice.call(elements));
      } else if (elements instanceof Element) {
        return parsedFontTeXInstanceList([elements]);
      } else if (elements instanceof fontTeX.ParsedFontTeX) {
        return [elements];
      } else if (Array.isArray(elements)) {
        let filtered = [];
        // Get list of all elements with an associated ParsedFontTeX instance
        let elementList = texElements.map(instance => instance.elem);
        for (let i = 0, l = elements.length; i < l; i++) {
          if (elements[i] instanceof fontTeX.ParsedFontTeX) {
            // Add to the filtered array right away if it's already a ParsedFontTeX instance.
            filtered.push(elements[i]);
          } else if (elements[i] instanceof Element) {
            // Only add the ParsedFontTeX instance if this element is associated with one.
            let index = elementList.indexOf(elements[i]);
            if (~index) {
              filtered.push(texElements[index].parsedTeXInstance);
            }
          }
        }
        return filtered;
      } else {
        return texElements.map(element => element.parsedTeXInstance);
      }
    }
  
    let texElements = [];
  
    // Used to update elements with rendered FontTeX content within them. 
    fontTeX.rerender = function rerender(elements) {
      let instances = parsedFontTeXInstanceList(elements);
      instances = texElements.filter(element => instances.includes(element.parsedTeXInstance));
  
      for (let i = instances.length - 1; i >= 0; i--) {
        instances[i].parsedTeXInstance.renderIn(instances[i].elem);
      }
    }
  
    // Used to update elements with rendered FontTeX content. When an element's styles changes, the
    // FontTeX content might look different from how it's supposed to. Specifically, changing the
    // font-family, font-size, and color will make the FontTeX look different and require the content
    // to be re-generated based on the new styles. This function takes a list of elements and updaates
    // their FontTeX content to match the new styles. Returns the number of elements whose styles
    // were updated.
    fontTeX.updateStyles = function updateStyles(elements) {
      let instances = parsedFontTeXInstanceList(elements);
      instances = texElements.filter(element => instances.includes(element.parsedTeXInstance));
  
      let numUpdates = 0;
  
      // From the filtered elements, find the elements whose styles have changed.
      for (let i = instances.length - 1; i >= 0; i--) {
        if (instances[i].oldFontFamily != instances[i].styles.fontFamily ||
            instances[i].oldFontSize != instances[i].styles.fontSize ||
            instances[i].oldColor != instances[i].styles.color) {
          // Keep track of the new styles and re-render the elements.
          instances[i].oldFontFamily = instances[i].styles.fontFamily;
          instances[i].oldFontSize = instances[i].styles.fontSize;
          instances[i].oldColor = instances[i].styles.color;
          instances[i].parsedTeXInstance.renderIn(instances[i].elem);
          numUpdates++;
        }
      }
      return numUpdates;
    }
  
    // A MutationObserver is made that checks for style changes in the document. If the ["autoupdate"]
    // setting is enabled, FontTeX content will be re-rendered automatically without requiring the 
    // user to call `fontTeX.updateStyles` themselves. This MutationObserver goes off if a node (like
    // a <style>) is added or removed from the document, or if there are attribute changes to any
    // elements. Since attribute changes happen all the time, only the "class" and "style" attributes
    // are looked at, which catches most cases of styles changing, but not always. Consider an element
    // whose ID is changed, making it match a selector in a stylesheet and changing its styles. This
    // won't be detected by the MutationObserver because it only looks at "class" and "style" but not
    // "id" or any other attributes.
    new MutationObserver(function() {
      if (settings["autoupdate"][0]) {
        fontTeX.updateStyles();
      }
    }).observe(document, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "style"]
    });
  
    // Exactly the same as `console.log` since some commands like \show output values to the console.
    let consoleMessage = console.log.bind(console);
  
    // The `parse` function takes in a string and parses its contents, looking for TeX syntax. Only
    // portions of the string within math delimiters like $ ... $ or \math ... \endmath will be read
    // as TeX while everything outside of them will be treated as-is. The return value is an instance
    // of fontTeX.ParsedFontTeX, which can be used to render TeX within HTML elements via its `ren-
    // derIn` method.
    fontTeX.parse = function parse(texString) {
      // The `eat` function looks at a character in `texString` and checks if it is a math delimiter
      // token. If the character is a math shift token (catcodes.MATHSHIFT), it'll return the token
      // right away. If the character is an active token (catcodes.ACTIVE) and it has been \let to a
      // math shift token, or \[, or \(, it'll return the \let value. If the character is an escape
      // token (catcodes.ESCAPE) and the macro that follows is \[, \(, or a \let synonym of one, it'll
      // return that. The second return value is the number of characters that were consumed.
      function eat(index) {
        const char = texString[index] || "";
        let catcode = data.cats[char.codePointAt(0)];
  
        if (!catcode) {
          return [{}, 0];
        }
  
        // Return immediately if the character is not the right catcode.
        catcode = catcode.value;
        if (catcode != catcodes.ESCAPE &&
            catcode != catcodes.MATHSHIFT &&
            catcode != catcodes.ACTIVE) {
          return [{}, 0];
        }
  
        if (catcode == catcodes.ESCAPE) {
          const nextChar = texString[index + 1];
          const nextCodePoint = texString.codePointAt(index + 1);
  
          // Get the name of the following macro.
          let name = "";
          let macro;
  
          if (nextCodePoint in data.cats && data.cats[nextCodePoint].value == catcodes.LETTER) {
            // Get the letters of the macro that follows.
            for (let i = index + 1, codePoint = texString.codePointAt(i);
                codePoint && codePoint in data.cats && data.cats[codePoint].value == catcodes.LETTER;
                codePoint = texString.codePointAt(++i)) {
              name += texString[i];
            }
  
            if (data.defs.macros[name]) {
              macro = data.defs.macros[name];
            } else {
              return [{}, 0];
            }
          } else if (nextChar && (data.defs.primitive[nextChar] || data.defs.macros[nextChar])) {
            // Assume the macro is just the one non-letter character
            name = nextChar;
            macro = data.defs.primitive[nextChar] || data.defs.macros[nextChar];
          } else {
            return [{}, 0];
          }
  
          // If the macro was \let, get the original.
          let wasLet = false;
          if (macro.isLet) {
            macro = macro.original;
            wasLet = true;
          }
  
          if (macro === data.defs.primitive['[']) {
            return [{
              type: 'command',
              name: '[',
              cat: -1
            }, name.length + 1];
          } else if (macro === data.defs.primitive['(']) {
            return [{
              type: 'command',
              name: '(',
              cat: -1
            }, name.length + 1];
          } else if (wasLet && macro.replacement && macro.replacement.length == 1 &&
              macro.replacement[0].cat == catcodes.MATHSHIFT) {
            return [{
              char: char,
              cat: catcodes.MATHSHIFT
            }, name.length + 1];
          } else {
            return [{}, 0];
          }
        } else if (catcode == catcodes.MATHSHIFT) {
          return [{
            char: char,
            cat: catcodes.MATHSHIFT
          }, 1];
        } else if (catcode == catcodes.ACTIVE && data.defs.active[char]) {
          if (data.defs.active[char].isLet) {
            let macro = data.defs.active[char].original
            if (macro === data.defs.primitive["["]) {
              return [{
                type: "command",
                name: "[",
                cat: -1
              }, 1];
            } else if (macro === data.defs.primitive["("]) {
              return [{
                type: "command",
                name: "(",
                cat: -1
              }, 1];
            } else if (macro.replacement && macro.replacement.length == 1 &&
                macro.replacement[0].cat == catcodes.MATHSHIFT) {
              return [{
                char: char,
                cat: catcodes.MATHSHIFT
              }, 1];
            }
          }
  
          return [{}, 0];
        } else {
          return [{}, 0];
        }
      }
  
      let content = [];
      const origString = texString;
      while (texString) {
        // Check if the current character has a catcode assigned to it. If it doesn't, catcodes.OTHER
        // is assumed
        if (texString.codePointAt(0) in data.cats) {
          let token = eat(0);
          let type = null;
          let length = 0;
  
          // If the token is a math shift token, check if the token following it is also a math shift
          // token. If it is (i.e. two consecutive math shift tokens), the equation is displayed.
          // Otherwise, the equation is inline.
          if (token[0].cat == catcodes.MATHSHIFT) {
            length += token[1];
            let token2 = eat(token[1]);
            if (token2[0].cat == catcodes.MATHSHIFT) {
              type = "display";
              length += token2[1];
            } else {
              type = "inline";
            }
          } else if (token[0].type == "command" && token[0].name == "[") {
            type = "display";
            length += token[1];
          } else if (token[0].type == "command" && token[0].name == "(") {
            type = "inline";
            length += token[1];
          }
  
          // Everything from now until the next closing math delimiter is parsed in the `tokenize`
          // function. Depending on if the equation type is displayed or inline, the closing math de-
          // limiter must match either \] or \), respectively.
          if (type == "display" || type == "inline") {
            let tokens = tokenize(texString.substring(length), type);
            // `tokenize` returns a 3-long array. The first item is an array of tokens from parsing.
            // The second item is the string that was left over after parsing. The third is a boolean
            // indicating whether the TeX group was closed correctly.
  
            // Check whether there was a closing token.
            if (tokens[2]) {
              // Trim to the string leftover after parsing.
              texString = tokens[1];
              // Push the tokens into the array, as well as an indicator of whether the tokens should
              // be rendered in display mode or text mode.
              content.push([tokens[0], type == "display" ? "display" : "text"]);
            } else {
              // If there was no closing token, push the string as normal without adding any parsed
              // tokens.
              content.push(texString);
              // Also break since we can treat the rest of the text as non-math-delimited.
              texString = "";
              break;
            }
          } else {
            // If the current character was not an opening math delimiter, add it on to the string so
            // far and move on.
            if (typeof content[content.length - 1] == "string") {
              content[content.length - 1] += texString[0];
            } else {
              content.push(texString[0]);
            }
            texString = texString.substring(1);
          }
        } else {
          // Assume catcodes.OTHER, which means it is not an opening math delimiter and we can treat
          // it as a plain character to add onto the end of the current string and move on.
          if (typeof content[content.length - 1] == "string") {
            content[content.length - 1] += texString[0];
          } else {
            content.push(texString[0]);
          }
          texString = texString.substring(1);
        }
      }
  
      return new fontTeX.ParsedFontTeX(origString, content);
    };
  
    // The `render` function takes an element and converts it into a FontTeX container. It uses the
    // element's "use" (or "data-use") attribute as the content, or, if the element has neither of
    // those two attributes, the element's own inner HTML. This allows the user to specify the content
    // of an element directly in the HTML markup instead of separately in a script. Using the "use"
    // attribute allows the element to display its regular HTML as a fall back, and only get replaced
    // once the TeX has actually finished rendering.
    fontTeX.render = function render(elements) {
      elements = elementList(elements);
      for (let i = elements.length - 1; i >= 0; i--) {
        let texString = elements[i].getAttribute(`${ftattr}-input`);
        if (texString === null) {
          texString = elements[i].getAttribute("use");
        }
        if (texString === null) {
          texString = elements[i].getAttribute("data-use");
        }
        if (texString === null) {
          texString = elements[i].innerHTML;
        }
        fontTeX.parse(texString).renderIn(elements[i]);
        elements[i].setAttribute(`${ftattr}-input`, texString);
      }
    }
  
    // <font-tex> elements are automatically and immediately rendered via the `fontTeX.render` func-
    // tion. This allows the user to use FontTeX without any scripting of their own. Look
    // at `fontTeX.render` above for details. Adding a <font-tex> element to the document will render
    // its contents right away using a <body>-wide MutationObserver.
    function renderAutoRenderingElements() {
      for (let element of document.getElementsByTagName("font-tex")) {
        if (element.getAttribute(`${ftattr}-is-parsed`) != "true") {
          fontTeX.render(element);
          element.setAttribute(`${ftattr}-is-parsed`, "true");
        }
      }
    }
    function setUpAutoRenderingElements() {
      new MutationObserver(renderAutoRenderingElements).observe(document.body, {
        childList: true,
        subtree: true
      });
      renderAutoRenderingElements();
    }
    if (document.readyState == "interactive") {
      setUpAutoRenderingElements();
    } else {
      document.addEventListener("readystatechange", function() {
        if (this.readyState == "interactive") {
          setUpAutoRenderingElements();
        }
      });
    }
  
    // This class is what gets returned when the user calls `fontTeX.parse`. It can be used to render
    // the parsed TeX in an HTML element with its `renderIn` method.
    fontTeX.ParsedFontTeX = class ParsedFontTeX {
      constructor(string, tokens) {
        this.texString = string;
        this.parsedTokens = tokens;
      }
  
      renderIn(elements) {
        // This method renders a ParsedFontTeX instance in a set of elements. The styles from the
        // element are computed automatically to make the TeX appear indistinguishable from the sur-
        // rounding text.
  
        // Wait for document.body.
        bodyLoaded.then(function() {
          let instance = this;
          let list = elementList(elements);
          let tokens = instance.parsedTokens.slice();
          for (let i = list.length - 1; i >= 0; i--) {
            // Empty out the element first.
            list[i].innerHTML = "";
  
            // Each element's styles are gotten first via getComputedStyles. The returned CSSStyleDec-
            // laration object is saved for future reference and reused.
            let cssDeclaration;
            if (list[i].hasAttribute(`${ftattr}-container-id`)) {
              let index = +list[i].getAttribute(`${ftattr}-container-id`);
              cssDeclaration = texElements[index].styles;
  
              texElements[index].oldFontFamily = cssDeclaration.fontFamily;
              texElements[index].oldFontSize = cssDeclaration.fontSize;
              texElements[index].oldColor = cssDeclaration.color;
              texElements[index].parsedTeXInstance = instance;
            } else {
              let index = texElements.length;
              cssDeclaration = getComputedStyle(list[i]);
              list[i].setAttribute(`${ftattr}-container-id`, index);
  
              texElements[index] = {
                elem: list[i],
                styles: cssDeclaration,
                parsedTeXInstance: instance,
                oldFontFamily: cssDeclaration.fontFamily,
                oldFontSize: cssDeclaration.fontSize,
                oldColor: cssDeclaration.oldColor
              };
            }
  
            // This makes sure that FontTeX will re-render an element once its font has loaded. If
            // FontTeX renders TeX inside an element before its font has actually loaded, the measure-
            // ments will be wrong, even though the CSSDeclaration tells us that we are measuring the
            // correct font. If a new font loads that changes the displayed font of an element, its
            // font measurements are cleared and it is re-rendered.
            let fontStack = cssDeclaration.fontFamily;
            onFontLoad(fontStack, function(font) {
              clearFontCache(font);
              fontTeX.rerender(this);
            }.bind(list[i]));
  
  
            if (!settings.parsehtml[0]) {
              // If the "parsehtml" option is false, the text outside of a group of TeX can be treated
              // as plain text instead of trying to parse it for HTML.
              let frag = document.createDocumentFragment();
              for (let n = 0, j = tokens.length; n < j; n++) {
                if (typeof tokens[n] == "string") {
                  // If the current token is just text, add it to a TextNode to prevent HTML parsing.
                  frag.appendChild(document.createTextNode(tokens[n]));
                } else {
                  // If the current token is a group of TeX tokens, use the `genHTML` function to con-
                  // vert it into a single <div> that can be added directly to the element.
                  frag.appendChild(genHTML(list[i], tokens[n][0], tokens[n][1], cssDeclaration));
                }
              }
              list[i].appendChild(frag);
            } else {
              // If the "parsehtml" option is true, we can't just add the text to a TextNode. Nesting
              // must also be taken into account (e.g. "<span>$\TeX$</span>"), so each section of text
              // also cannot be converted directly to HTML because the opening/closing tags must match
              // up (to prevent something like "<span></span>$\TeX$<span></span>"). We could just
              // parse a group of TeX tokens, stringify the HTML using the .innerHTML property, and
              // then have one complete string such as "<span><span> [TeX markup] </span></span>",
              // then set that into the element by changing its .innerHTML. FontTeX however uses
              // <canvas> elements to render certain characters, such as \left ... \right delimiters.
              // Stringifying a <canvas> destroys any drawings it may have, so when we place that
              // stringified version into an element, <canvas> elements will appear blank. The only
              // option is to save the exact <canvas> elements produced by `genHTML` and place those
              // elements into the containing element without stringifying it. So we have to stringify
              // everything that is NOT a group of TeX tokens, but NOT stringify everything that is,
              // and then combine those two in one parent element.
  
              // To accomplish this, every group of TeX tokens get associated with one, unique <span>
              // element, which DOES get stringified. The entire string of HTML will look something
              // like "<span><span data-fontTeX-uuid-[UUID]></span></span>". That string then gets
              // placed into the containing element via its .innerHTML property. Every <span> element
              // then gets replaced with the HTML from `genHTML`, which happens without stringifying
              // the replacement element. The HTML from the original string gets parsed, and the
              // element from `genHTML` appears in the document without destroying any <canvas> data.
  
              // This system relies directly on the user's own input of HTML, so it is cannot be free
              // of errors unless the user's own HTML is well-formed. An example of malformed HTML
              // that can mess up this system is "<span class='no-closing-quote>$\TeX$</span>". The
              // string that will be generated from this will be something like
              // "<span class='no-closing-quote><span data-fontTeX-uuid-[UUID]></span></span>". The
              // entire <span> was absorbed into the <span>'s class attribute, so there is no target
              // for the TeX tokens to replace. This can only happen with malformed user input, and
              // there's no way (that I know of) to protect against it without making an HTML valida-
              // tor.
  
              let html = "";
              let elementIds = [];
              for (let n = 0, j = tokens.length; n < j; n++) {
                if (typeof tokens[n] == "string") {
                  html += tokens[n];
                } else {
                  // Generate a UUID for the <div> to ensure it is distinguishable.
                  let uuid = make_uuid();
                  elementIds.push(
                    [uuid, genHTML(list[i], tokens[n][0], tokens[n][1], cssDeclaration)]
                  );
                  html += `<span ${ftattr}-uuid-${uuid}></span>`;
                }
              }
  
              // Now, `html` is a string of HTML that needs to be parsed.
              let div = document.createElement("div");
              div.innerHTML = html;
              let malformed = false;
              for (let n = 0, j = elementIds.length; n < j; n++) {
                let elem = div.querySelector(`[${ftattr}-uuid-${elementIds[n][0]}]`);
                if (!elem) {
                  // The element was absorbed from malformed HTML somewhere.
                  malformed = true;
                  continue;
                }
                elem.parentNode.insertBefore(elementIds[n][1], elem);
                elem.parentNode.removeChild(elem);
              }
  
              if (malformed) {
                console.warn(
                  `Malformed HTML was passed into \`renderIn\`. Some TeX couldn't be rendered.\nPassed in value: ${this.texString}`
                );
              }
  
              for (let n = 0, j = div.childNodes.length; n < j; n++) {
                list[i].appendChild(div.firstChild);
              }
            }
  
            list[i].setAttribute(`${ftattr}-input`, instance.texString);
            list[i].setAttribute(`${ftattr}-is-parsed`, "true");
          }
        }.bind(this));
      }
  
      again() {
        // This method will take the original string of TeX and reparse it. This can be helpful for
        // new definitions that weren't there the first time the string was parsed, or for certain
        // registers, like \time, which changes every minute. There is a `rerender` alias function
        // that can be used instead.
        this.parsedTokens = fontTeX.parse(this.texString).parsedTokens;
        return this;
      }
  
      reparse() {
        // This method will take the original string of TeX and reparse it. This can be helpful for
        //new definitions that weren't there the first time the string was parsed, or for certain
        // registers, like \time, which changes every minute. There is an `again` alias function that
        // can be used instead.
        this.parsedTokens = fontTeX.parse(this.texString).parsedTokens;
        return this;
      }
    }
  
    // The `tokenize` function is where a string of TeX is read, interpreted, and transformed into
    // tokens. The resulting array of tokens is used in genHTML to make the elements to display.
    function tokenize(texString, style, returnScope) {
      // This function parses the `texString` argument until a closing delimiter is found to indicate
      // the end of the TeX syntax part of the string. The `style` argument should be a string, one of
      // "display", "inline", or "standalone". If "display", the closing delimiter to look for will be
      // either "$$" or "\]" (or tokens that have been \let to that). If "inline", the closing delim-
      // iter to look for will be either "$" or "\)" (or tokens that have been \let to that). If
      // "standalone", no closing delimiter will be looked for; only the end of the string will indic-
      // ate where to stop parsing. The resturn value is determined by `returnScope`. If `returnScope`
      // is true, the string is parsed and the outer scope that keeps track of changes like \defs and
      // changing registers is returned (used for `fontTeX.global`). If false, the tokens are returned
      // in a 3-long array. The first item will be the list of tokens that were parsed, the second
      // item will be the leftover string found after the closing delimiters (the empty string if
      // `style` is "standalone"), and the third item will be a boolean indicating if the TeX parser
      // exited successfully (i.e. the closing delimiter was found) (always true if `style` is
      // "standalone").
  
      // The `queue` (more of a stack really) is used to hold tokens that need to be parsed. Normally,
      // tokens are taken from the input string sequentially, but the queue takes priority for provi-
      // ding tokens that need to be parsed before getting back to the input string. When a macro is
      // expanded, it's tokens are stuck at the front of the input stream (the queue) while the rest
      // of the string is pushed back to be parsed after the new tokens are parsed.
      let queue = [];
  
      // Used from here on out instead of `texString`.
      let string = texString;
  
      // The `scopes` array (also more of a stack) keeps track of TeX grouping. Each time a curly
      // brace group ("{ ... }") is encountered (or in other scenarios as well like \left ... \right
      // delimiters), a new Scope is created that keeps track of any definitions that happen within
      // that scope. New definitions are kept local to that scope only and are completely undone once
      // the scope closes (unless you use \global to affect all scopes).
      let scopes = [];
      // Make the last scope easily attainable.
      scopes.last = function() { 
        return scopes[scopes.length - 1];
      }
  
      // This is where the list of tokens will go once they are completely parsed.
      let finalTokens = [];
  
      // A \def (and other assignments) can be prefixed by \global, \outer, or \long. FontTeX doesn't
      // take \outer and \long into account since their main purpose is for debugging as opposed to
      // actually adding any functionality. Whenever \global is encountered, `prefixedToggles.global`
      // is set to `true` for any \def that may follow.
      let prefixedToggles = {
        global: false
      }
  
      // `contexts` keeps track of the context of what's being parsed. For example, when
      // a superscript token is found, a new context is opened called "superscript". It
      // tells the next atom to be parsed that it should be added on to the previous atom
      // as a superscript instead of becoming its own distinct atom. It's an array be-
      // cause multiple contexts can be opened at once.
      let contexts = [];
      // Assign a `last' attribute to the array so that the last item is easily acces-
      // sible.
      Object.defineProperty(contexts, 'last', {
        get: function() {
          return this[this.length - 1];
        }
      });
  
      // The `Mouth` class allows for easy "eating" of the tokens. It looks at the beginning of a
      // string and returns the characters that make up an entire token. For example "\macro" returns
      // the entire "\macro" instead of just "/".
      class Mouth{
        constructor(customString, customQueue) {
          // Save a custom copy of `queue` and `string`. Any functions that change the string or token
          // remain local, not affecting the outer `queue` and `string`, until you call the `finalize`
          // method to finalize any local changes.
          this.queue = (customQueue || queue).slice();
          this.string = typeof customString == "string" ? customString : string;
  
          // The `history`` array stores "states" of the Mouth that can be restored if the `revert`
          // method is called.
          this.history = [];
  
          // The savedStates object is used by the saveState method defined below.
          this.savedStates = {};
  
          // The `eat` function will "eat" part of the string or queue and return a token. An optional
          // `context' argument can be provided. This will tell the function to look for a specific set
          // of tokens. For example, if the string "number" is passed, the eat function will look for a
          // specific set of tokens that make up a number. This is helpful for stuff like the \char com-
          // mand, which expects a number to immediately follow it. If there are no more tokens to parse
          // (i.e. the string is empty) or the expected context doesn't match the tokens that were
          // parsed.
          this.eat = function (context) {
            // Some contexts require a new mouth so that changes aren't permanent.
            let mouth;
            let groups;
            let tokens;
            let sign;
            let subContext;
            let digits;
            let found;
            let mouthContext;
            let foundFactor;
            let foundUnit;
            let sp;
            let em;
            let mu;
            let trueSpecified;
            let stretchSign;
            let shrinkSign;
            let foundShrink;
            let foundStretch;
            let lastState;
            let start;
            let stretch;
            let shrink;
  
            switch (context) {
              // If there is no context, just parse a single command or character token. This is the
              // usual case. The 'pre space' context is the same as the regular behavior except that
              // space tokens can be returned (normally, whitespace tokens are skipped over and the
              // next token is returned).
              case undefined:
              case "pre space":
              default:
                // If there is a token in `queue`, that should be returned first.
                if (this.queue.length) {
                  // If the next token is a space character, don't return it unless the context is
                  // "pre space".
                  if (this.queue[0].cat == catcodes.WHITESPACE && context != "pre space") {
                    this.queue.shift();
                    return this.eat(context);
                  }
  
                  // Return the next token.
                  this.history.push({
                    queue: this.queue.slice(),
                    string: this.string,
                    history: this.history.slice()
                  });
                  return this.queue.shift();
                }
  
                // If the string is empty, there are no more tokens to return. Return null.
                if (this.string.length == 0) {
                  return null;
                }
                // Check if the next token is an escape character, indicating the start of a macro
                // name (usually a "\").
                else if (catOf(this.string[0]) == catcodes.ESCAPE) {
                  // If there are no more characters, or just an EOL character, then the command name
                  // is empty. The macro name is just the empty string.
                  if (!this.string[1] || this.string[1] == '\n') {
                    this.history.push({
                      queue: this.queue.slice(),
                      string: this.string,
                      history: this.history.slice()
                    });
                    this.string = this.string.substring(2);
                    return {
                      type: "command",
                      escapeChar: this.string[0],
                      name: "",
                      nameType: "command"
                    };
                  }
  
                  // Otherwise, the command actually has a name.
                  // If the first characters are a double superscript character replacement, then re-
                  // place it with the proper character.
                  if (this.string[1] == this.string[2] &&
                    catOf(this.string[1]) == catcodes.SUPERSCRIPT && this.string[4] &&
                    "0123456789abcdef".includes(this.string[3]) &&
                    "0123456789abcdef".includes(this.string[4])) {
                    this.string = this.string[0] +
                      String.fromCodePoint(parseInt(this.string.substring(3, 5), 16)) +
                      this.string.substring(5);
                  } else if (this.string[1] == this.string[2] && catOf(this.string[1]) ==
                    catcodes.SUPERSCRIPT && this.string.codePointAt(3) < 128) {
                    this.string = this.string[0] +
                      String.fromCharCode((this.string.codePointAt(3) + 64) % 128) +
                      this.string.substring(4);
                  }
  
                  // Check for what type of command name this is: either a one non-letter character,
                  // or a string of only-letter characters.
                  if (catOf(this.string[1]) == catcodes.LETTER) {
                    let name = "";
                    // Iterate through all the letters.
                    for (let i = 1; true; i++) {
                      // Check if this character is a plain letter.
                      if (catOf(this.string[i]) == catcodes.LETTER) {
                        name += this.string[i];
                      }
                      // Check if this is a double superscript combo with a hexadecimal number.
                      else if (this.string[i] == this.string[i + 1] && catOf(this.string[i]) ==
                        catcodes.SUPERSCRIPT && "0123456789abcdef".includes(this.string[i + 2]) &&
                        "0123456789abcdef".includes(this.string[i + 3])) {
                        this.string =
                          this.string.substring(0, i) +
                          String.fromCodePoint(parseInt(this.string.substring(i + 2, i + 4), 16)) +
                          this.string.substring(i + 4);
                        i--;
                      }
                      // Check if this is a double superscript combo with a character.
                      else if (this.string[i] == this.string[i + 1] && catOf(this.string[i]) ==
                        catcodes.SUPERSCRIPT && this.string.codePointAt(i + 2) < 128) {
                        this.string = this.string.substring(0, i) +
                          String.fromCodePoint((this.string.codePointAt(i + 2) + 64) % 128) +
                          this.string.substring(i + 3);
                        i--;
                      } else {
                        // The character is a non-letter. The end of the command has been reached.
                        break;
                      }
                    }
  
                    // Update the history and return.
                    this.history.push({
                      queue: this.queue.slice(),
                      string: this.string,
                      history: this.history.slice()
                    });
                    let token = {
                      type: "command",
                      escapeChar: this.string[0],
                      name: name,
                      nameType: "command"
                    };
                    this.string = this.string.substring(1 + name.length);
                    return token;
                  } else {
                    this.history.push({
                      queue: this.queue.slice(),
                      string: this.string,
                      history: this.history.slice()
                    });
                    let token = {
                      type: "command",
                      escapeChar: this.string[0],
                      name: this.string[1],
                      nameType: "symbol"
                    };
                    this.string = this.string.substring(2);
                    return token;
                  }
                }
                // Check if the next token is a double superscript combo with a hexadecimal number.
                else if (this.string[0] == this.string[1] && catOf(this.string[0]) ==
                  catcodes.SUPERSCRIPT && "0123456789abcdef".includes(this.string[2]) &&
                  "0123456789abcdef".includes(this.string[3])) {
                  this.string =
                    String.fromCodePoint(parseInt(this.string.substring(2, 4), 16)) +
                    this.string.substring(4);
                  // Reparse this token.
                  return this.eat(context);
                }
                // Check if the next token is a double superscript combo with a character.
                else if (this.string[0] == this.string[1] && catOf(this.string[0]) ==
                  catcodes.SUPERSCRIPT && this.string.codePointAt(2) < 128) {
                  this.string =
                    String.fromCodePoint((this.string.codePointAt(2) + 64) % 128) +
                    this.string.substring(3);
                  return this.eat(context);
                }
                // Check if this token matches one of these catcodes. If it does, it doesn't need any
                // extra processing and can be treated regularly as a token.
                else if ([
                  catcodes.OPEN,
                  catcodes.CLOSE,
                  catcodes.MATHSHIFT,
                  catcodes.ALIGN,
                  catcodes.PARAMETER,
                  catcodes.SUPERSCRIPT,
                  catcodes.SUBSCRIPT,
                  catcodes.LETTER,
                  catcodes.OTHER,
                  catcodes.ACTIVE
                ].includes(catOf(this.string[0]))) {
                  this.history.push({
                    queue: this.queue.slice(),
                    string: this.string,
                    history: this.history.slice()
                  });
                  let char = this.string[0];
                  this.string = this.string.substring(1);
                  return {
                    type: "character",
                    char: char,
                    code: char.codePointAt(0),
                    cat: catOf(char)
                  };
                }
                // An end-of-line character discards everything after the line, up until the next new-
                // line character.
                else if (catOf(this.string[0]) == catcodes.ENDOFLINE) {
                  let index = this.string.indexOf('\n');
                  this.string = this.string.substring(~index ? index + 1 : this.string.length);
                  // After a new line, all the whitespace after it has to be removed, even in a "pre
                  // space" context.
                  while (catOf(this.string[0]) == catcodes.WHITESPACE) {
                    this.string = this.string.substring(1);
                  }
                  // If an eol character was found, a whitespace character is added. That means an
                  // eol character is essentially a whitespace character, which are normally skipped
                  // over anyway, just not in the "pre space" context.
                  if (context == "pre space") {
                    this.queue.unshift({
                      type: "character",
                      char: " ",
                      code: " ".codePointAt(0),
                      cat: catcodes.WHITESPACE
                    });
                  }
                  return this.eat(context);
                }
                // Comments are similar to EOL character; everything on the line is discarded, but no
                // whitespace token is added at the end.
                else if (catOf(this.string[0]) == catcodes.COMMENT) {
                  // Comments work the same as new line characters. All tokens on the same line are
                  // discarded, but a space token isn't added to the queue.
                  let index = this.string.indexOf('\n');
                  this.string = this.string.substring(~index ? index + 1 : this.string.length);
                  return this.eat(context);
                }
                // Since whitespace tokens are ignored in math mode, they are basically the same as
                // ignored characters. Ignored tokens get removed and the next token is parsed and re-
                // turned instead.
                else if (catOf(this.string[0]) == catcodes.WHITESPACE && context != "pre space" ||
                  catOf(this.string[0]) == catcodes.IGNORE) {
                  this.string = this.string.substring(1);
                  return this.eat(context);
                }
                // Return the whitespace token directly if the context is "pre space".
                else if (catOf(this.string[0]) == catcodes.WHITESPACE && context == "pre space") {
                  this.history.push({
                    queue: this.queue.slice(),
                    string: this.string,
                    history: this.history.slice()
                  });
                  let char = this.string[0];
                  this.string = this.string.substring(1);
                  return {
                    type: "character",
                    char: char,
                    code: char.codePointAt(0),
                    cat: catcodes.WHITESPACE
                  };
                }
                // Invalid characters are treated as catcode 12 (OTHER), but marked as invalid.
                else if (catOf(this.string[0]) == catcodes.INVALID) {
                  this.history.push({
                    queue: this.queue.slice(),
                    string: this.string,
                    history: this.history.slice()
                  });
                  let char = this.string[0];
                  this.string = this.string.substring(1);
                  return {
                    type: "character",
                    char: char,
                    code: char.codePointAt(0),
                    cat: catcodes.OTHER,
                    invalid: true
                  };
                }
                break;
  
              // This context is used to get arguments for primitives and macros. It uses the default
              // context to get the first token. If it's an opening token, all the tokens up to the
              // closing token will be returned. Otherwise, the single token is returned. An example
              // is \accent. \accent takes two arguments. The first is the code point of the character
              // to use as the accent. The second argument though can be anything, including a group
              // of tokens. That's where this context comes in.
              case "argument":
                mouth = new Mouth(this.string, this.queue);
                groups = 0;
                tokens = [];
  
                do {
                  let token = mouth.eat();
  
                  if (!token) {
                    break;
                  } else if (token.cat == catcodes.OPEN) {
                    groups++;
                  } else if (token.cat == catcodes.CLOSE) {
                    groups--;
                  }
                  tokens.push(token);
                } while (groups > 0);
  
                // If groups is > 0 (i.e. the group was never closed) or there are no tokens, return
                // null to indicate the token eating failed.
                if (groups > 0 || tokens.length == 0) {
                  return null;
                }
  
                this.history.push({
                  queue: this.queue.slice(),
                  string: this.string,
                  history: this.history.slice()
                });
                mouth.finalize();
                this.string = mouth.string;
                return tokens;
  
              case "integer":
                // The integer context looks for an integer in the next available tokens. There are
                // different syntaxes for numbers; all of them are described in detail in the TeXbook
                // (pg. 269).
                mouth = new Mouth(this.string, this.queue);
  
                // The `intContext` variable keeps track of which tokens are allowed to appear next.
                // For example, a "-" is allowed at the beginning of the number, but not after any
                // digits have already been found.
                subContext = "start";
  
                // This variable is always either 1 or -1 and keeps track of the sign of the number.
                // For every "-" that is encountered before the actual digits, this variable is multi-
                // plied by -1.
                sign = 1;
  
                // `digits` keep track of the numbers that have already been parsed. More numbers may
                // be added on before it's finished.
                digits = 0;
  
                // `found` is a boolean indicating if any actual digits were found. For example, --"
                // is the start of a hexadecimal number, but no digits are actually defined. That has
                // to be differentiated with --"0, which is a valid number translating to just 0.
                found = false;
  
                // `mouthContext` is the context for the sub-mouth we made above.
                mouthContext = "pre space";
  
                while (true) {
                  // `token` is what is going to be focused on for this iteration of the loop.
                  let token = mouth.eat(mouthContext);
  
                  // If there is no token, then the string has been exhausted and there's nothing left
                  // to parse.
                  if (!token) {
                    break;
                  }
  
                  // If this is a command or active character, expand it, but only if the token ex-
                  // pands to a register.
                  if (subContext == "start" && (token.type == "command" ||
                    token.type == "character" && token.cat == catcodes.ACTIVE)) {
                    let macro = token.type == "command" ?
                      scopes[scopes.length - 1].defs.primitive[token.name] ||
                      scopes[scopes.length - 1].defs.macros[token.name] ||
                      scopes[scopes.length - 1].registers.named[token.name] :
                      scopes[scopes.length - 1].defs.active[token.char];
  
                    if (macro && macro.proxy) {
                      macro = macro.original;
                    }
  
                    if (macro && (macro.register || registerPrimitives.includes(macro))) {
                      let expansion = expand(token, mouth);
  
                      // Check if the expansion failed.
                      if (expansion.length == 1 && expansion[0] === token && token.invalid) {
                        mouth.revert();
                        break;
                      }
  
                      // Add the expansion to the queue.
                      mouth.queue.unshift.apply(mouth.queue, expansion);
                      continue;
                    } else if (macro === data.defs.primitive.relax) {
                      break;
                    } else {
                      mouth.revert();
                      break;
                    }
                  } else if (subContext == "start" && token.cat == catcodes.WHITESPACE) {
                    // A regular whitespace token was found. Just ignore and continue;
                    continue;
                  } else if (subContext == "start" && token.cat == catcodes.OTHER &&
                    token.char == '-') {
                    // A minus sign was found. Negate `sign` so that the final number will also be
                    // negated.
                    sign *= -1;
                  } else if (subContext == "start" && token.cat == catcodes.OTHER &&
                    token.char == '+') {
                    // A plus sign doesn't do anything to the sign, so it can just be ignored.
                    continue;
                  } else if (subContext == "start" && token.register) {
                    // A register was found, like \count1 or \escapechar. It doesn't matter what type
                    // of register it is yet because all registers can be coerced into integers.
                    if (token.type == "integer") {
                      // Use the integers value.
                      digits = token.value;
                      mouthContext = "pre space";
                    } else if (token.type == "dimension") {
                      // The `sp` value of a dimension is used as the integer. The `em` value is also
                      // converted. 1em == 12 * 65536sp since 12 pt == 1rem. This assumes 1em == 1rem
                      // == 16px == 12pt, which is not always the case, but there's no way to know for
                      // sure how many pixels 1em actually translates to without knowing the element's
                      // font-size.
                      digits = token.sp.value + token.em.value * 12;
                    } else if (token.type == "mu dimension") {
                      // This uses the same logic as above. It assumes 18mu == 1em == 1rem == 16px ==
                      // 12pt. 1mu == 12 / 18 * 65536sp.
                      digits = token.mu.value * 12 / 18;
                    } else if (token.type == "glue") {
                      // Only the start dimension is considered for glue objects. Its dimension is co-
                      // erced to an integer the same way as above.
                      digits = token.start.sp.value + token.start.em.value * 12;
                    } else if (token.type == 'mu glue') {
                      // Same logic for mu glue as for regular glue, except 18 mu == 12pt.
                      digits = token.start.mu.value * 12 / 18;
                    }
                    found = true;
                    break;
                  } else if (subContext == "start") {
                    // Try getting a plain number from the "unsigned int" context.
                    mouthContext = "unsigned int";
                    mouth.revert();
                  } else {
                    // A character was found that's not part of the number. Put the token back and
                    // finish parsing.
                    mouth.revert();
                    break;
                  }
                }
  
                // Check if actual digits were found.
                if (!found) {
                  return null;
                }
  
                // Multiply `digits` by `sign` to give the number its sign.
                digits *= sign;
  
                // Finalize any changes the Mouth made.
                this.history.push({
                  queue: this.queue.slice(),
                  string: this.string,
                  history: this.history.slice()
                });
                mouth.finalize();
                this.string = mouth.string;
                // Create and return a new IntegerReg to hold the numerical value.
                return new IntegerReg(digits);
                break;
  
              case "dimension":
                // A lot of what happens here is explained in the "number" case above.
                mouth = new Mouth(this.string, this.queue);
                subContext = "start";
                sign = 1;
                digits = " ";
                foundFactor = false;
                foundUnit = false;
                sp = 0;
                em = 0;
                mouthContext = "pre space";
                sp = 0;
                em = 0;
                trueSpecified = false;
  
                while (!foundUnit) {
                  let token = mouth.eat(mouthContext);
  
                  if (!token) {
                    break;
                  }
  
                  if (subContext == "start" && (token.type == "command" ||
                    token.type == "character" && token.cat == catcodes.ACTIVE)) {
                    let macro = token.type == "command" ?
                      scopes[scopes.length - 1].defs.primitive[token.name] ||
                      scopes[scopes.length - 1].defs.macros[token.name] ||
                      scopes[scopes.length - 1].registers.named[token.name] :
                      scopes[scopes.length - 1].defs.active[token.char];
  
                    if (macro && macro.proxy) {
                      macro.original = macro;
                    }
  
                    if (macro && (macro.register || registerPrimitives.includes(macro))) {
                      let expansion = expand(token, mouth);
  
                      if (expansion.length == 1 && expansion[0] === token && token.invalid) {
                        mouth.revert();
                        break;
                      }
  
                      mouth.queue.unshift.apply(mouth.queue, expansion);
                      continue;
                    } else if (macro === data.defs.primitive.relax) {
                      break;
                    } else {
                      mouth.revert();
                      break;
                    }
                  } else if (subContext == "start" && token.cat == catcodes.WHITESPACE) {
                    continue;
                  } else if (subContext == "start" && token.cat == catcodes.OTHER &&
                    token.char == "-") {
                    sign *= -1;
                  } else if (subContext == "start" && token.cat == catcodes.OTHER &&
                    token.char == "+") {
                    continue;
                  } else if (subContext == "start" && !foundFactor && token.register) {
                    if (token.type == "integer") {
                      digits = token.value;
                      // If there is a "decimal" message, then the integer is intended to be read as a
                      // decimal and is divided by 65536.
                      if (token.message == "decimal") {
                        digits /= 65536;
                      }
                      digits = " " + digits;
                      mouthContext = "pre space";
                      subContext = "unit start";
                    } else if (token.type == "dimension") {
                      sp = token.sp.value;
                      em = token.em.value;
                      foundUnit = true;
                    } else if (token.type == "mu dimension") {
                      em = token.mu.value / 18;
                      foundUnit = true;
                    } else if (token.type == "glue") {
                      sp = token.start.sp.value;
                      em = token.start.em.value;
                      foundUnit = true;
                    } else if (token.type == "mu glue") {
                      em = token.start.mu.value / 18;
                      foundUnit = true;
                    }
                    foundFactor = true;
                    if (foundUnit) {
                      break;
                    }
                    continue;
                  } else if (foundFactor && subContext == "unit start" && token.cat ==
                    catcodes.WHITESPACE) {
                    subContext = "unit start";
                  } else if (foundFactor && token.register) {
                    digits = parseFloat((digits + " ").replace(" .", ".").replace(". ", "") || "0");
                    if (token.type == "integer") {
                      sp = digits * token.value;
                    } else if (token.type == "dimension") {
                      sp = digits * token.sp.value;
                      em = digits * token.em.value;
                    } else if (token.type == "mu dimension") {
                      em = digits * token.mu.value / 18;
                    } else if (token.type == "glue") {
                      sp = digits * token.start.sp.value;
                      em = digits * token.start.em.value;
                    } else if (token.type == "mu glue") {
                      em = digits * token.start.mu.value;
                    }
                    foundUnit = true;
                    break;
                  } else if (foundFactor && !trueSpecified && (token.char == "t" ||
                    token.char == "T")) {
                    // Looks for the word "true" (indicating the value respects the \mag register).
                    let r = mouth.eat("pre space");
                    if (r && (r.char == "r" || r.char == "R") && r.cat != catcodes.ACTIVE) {
                      let u = mouth.eat("pre space");
                      if (u && (u.char == "u" || r.char == "U") && u.cat != catcodes.ACTIVE) {
                        let e = mouth.eat("pre space");
                        if (e && (e.char == "e" || e.char == "E") && e.cat != catcodes.ACTIVE) {
                          trueSpecified = true;
                          subContext = "unit start";
                          continue;
                        } else {
                          mouth.revert(4);
                        }
                      } else {
                        mouth.revert(3);
                      }
                    } else {
                      mouth.revert(2);
                    }
                    break;
                  } else if (foundFactor && !trueSpecified && (token.char == "e" ||
                    token.char == "E")) {
                    // Looks for em or ex units. These aren't allowed with the "true" keyword.
                    let secondLetter = mouth.eat("pre space");
                    if (secondLetter && (secondLetter.char == "m" || secondLetter.char == "M") &&
                      secondLetter.cat != catcodes.ACTIVE) {
                      em = parseFloat((digits + " ").replace(" .", ".").replace(". ", "") || "0") *
                        65536;
                    } else if (secondLetter && (secondLetter.char == "x" ||
                      secondLetter.char == "X") && 
                      secondLetter.cat != catcodes.ACTIVE) {
                      // Since DimenReg objects can only store values in em values, the ex unit has to
                      // be converted to em units. Normally the ex unit depends on the font, but we
                      // don't know the font yet since we don't have access to the elements. 1ex is
                      // assumed to be (9107 / 19200) em, which is about 0.474322916667 of an em. That
                      // number was found by taking the ex-height of the serif, monospace, and sans-
                      // serif font on my computer using Google Chrome. Averaging them all out (serif:
                      // 359/800, sans-serif: 3347/6400, monospace: 361/800) yields 9107 / 19200.
                      em = parseFloat((digits + " ").replace(" .", ".").replace(". ", "") || "0") *
                        9107 / 19200 * 65536;
                    } else {
                      mouth.revert(2);
                      break;
                    }
                    foundUnit = true;
                  } else if (foundFactor && (token.char == "p" || token.char == "P")) {
                    // Looks for "pt", "pc", and "px" ("px" isn't valid in TeX, but this is CSS, so it
                    // only makes sense that you're allowed to use px here too).
                    let secondLetter = mouth.eat("pre space");
                    if (secondLetter && (secondLetter.char == "t" || secondLetter.char == "T") &&
                      secondLetter.cat != catcodes.ACTIVE) {
                      sp = parseFloat((digits + " ").replace(" .", ".").replace(". ", "") || "0") *
                        65536;
                      foundUnit = true;
                    } else if (secondLetter && (secondLetter.char == "c" ||
                      secondLetter.char == "C") && secondLetter.cat != catcodes.ACTIVE) {
                      sp = parseFloat((digits + " ").replace(" .", ".").replace(". ", "") || '0') *
                        65536 * 12;
                      foundUnit = true;
                    } else if (secondLetter && (secondLetter.char == "x" ||
                      secondLetter.char == "X") && secondLetter.cat != catcodes.ACTIVE) {
                      sp = parseFloat((digits + " ").replace(" .", ".").replace(". ", "") || "0") *
                        65536 * 12 / 16;
                      foundUnit = true;
                    } else {
                      mouth.revert(2);
                      break;
                    }
                  } else if (foundFactor && (token.char == "i" || token.char == "I")) {
                    let n = mouth.eat("pre space");
                    if (n && (n.char == "n" || n.char == "N") && n.cat != catcodes.ACTIVE) {
                      sp = parseFloat((digits + " ").replace(" .", ".").replace(". ", "") || "0") *
                        65536 * 72;
                      foundUnit = true;
                    } else {
                      mouth.revert(2);
                      break;
                    }
                  } else if (foundFactor && (token.char == "b" || token.char == "B")) {
                    let p = mouth.eat("pre space");
                    if (p && (p.char == "p" || p.char == "P") && p.cat != catcodes.ACTIVE) {
                      // 1bp is basically 1pt, so just use that.
                      sp = parseFloat((digits + " ").replace(" .", ".").replace(". ", "") || "0") *
                        65536;
                      foundUnit = true;
                    } else {
                      mouth.revert(2);
                      break;
                    }
                  } else if (foundFactor && (token.char == "c" || token.char == "C")) {
                    let secondLetter = mouth.eat("pre space");
                    if (secondLetter && (secondLetter.char == "m" || secondLetter.char == "M") &&
                      secondLetter.cat != catcodes.ACTIVE) {
                      sp = parseFloat((digits + " ").replace(" .", ".").replace(". ", "") || "0") *
                        65536 * 72 / 2.54;
                      foundUnit = true;
                    } else if (secondLetter && (secondLetter.char == "c" ||
                      secondLetter.char == "C") && secondLetter.cat != catcodes.ACTIVE) {
                      sp = parseFloat((digits + " ").replace(" .", ".").replace(". ", "") || "0") *
                        65536 * 1238 / 1157 * 12;
                      foundUnit = true;
                    } else {
                      mouth.revert(2);
                      break;
                    }
                  } else if (foundFactor && (token.char == "m" || token.char == "M")) {
                    let m = mouth.eat("pre space");
                    if (m && (m.char == "m" || m.char == "M") && m.cat != catcodes.ACTIVE) {
                      sp = parseFloat((digits + " ").replace(" .", ".").replace(". ", "") || "0") *
                        65536 * 72 / 2.54 / 10;
                      foundUnit = true;
                    } else {
                      mouth.revert(2);
                      break;
                    }
                  } else if (foundFactor && (token.char == "d" || token.char == "D")) {
                    let d = mouth.eat("pre space");
                    if (d && (d.char == "d" || d.char == "D") && d.cat != catcodes.ACTIVE) {
                      sp = parseFloat((digits + " ").replace(" .", ".").replace(". ", "") || "0") *
                        65536 * 1238 / 1157;
                      foundUnit = true;
                    } else {
                      mouth.revert(2);
                      break;
                    }
                  } else if (foundFactor && (token.char == "s" || token.char == "S")) {
                    let p = mouth.eat("pre space");
                    if (p && (p.char == "p" || p.char == "P") && p.cat != catcodes.ACTIVE) {
                      sp = parseFloat((digits + " ").replace(" .", ".").replace(". ", "") || "0");
                      foundUnit = true;
                    } else {
                      mouth.revert(2);
                      break;
                    }
                  } else if (subContext == "start" && !foundFactor) {
                    mouthContext = "factor";
                    mouth.revert();
                  } else {
                    mouth.revert();
                    break;
                  }
                }
  
                if (!foundFactor || !foundUnit) {
                  return null;
                }
  
                sp *= sign;
                em *= sign;
                this.history.push({
                  queue: this.queue.slice(),
                  string: this.string,
                  history: this.history.slice()
                });
                mouth.finalize();
                this.string = mouth.string;
                return trueSpecified ?
                  new DimenReg(
                    sp * 1000 / scopes[scopes.length - 1].registers.named.mag.value,
                    em * 1000 / scopes[scopes.length - 1].registers.named.mag.value
                  ) :
                  new DimenReg(
                    sp,
                    em
                  );
                break;
  
              case "mu dimension":
                // Same thing as dimension except only math units are allowed.
                mouth = new Mouth(this.string, this.queue);
                subContext = "start";
                sign = 1;
                digits = " ";
                foundFactor = false;
                foundUnit = false;
                mouthContext = "pre space";
                mu = 0;
                trueSpecified = false;
  
                while (!foundUnit) {
                  let token = mouth.eat(mouthContext);
  
                  if (!token) {
                    break;
                  }
  
                  if (subContext == "start" && (token.type == "command" ||
                    token.type == "character" && token.cat == catcodes.ACTIVE)) {
                    let macro = token.type == "command" ?
                      scopes[scopes.length - 1].defs.primitive[token.name] ||
                      scopes[scopes.legnth - 1].defs.macros[token.name] ||
                      scopes[scopes.length - 1].registers.named[token.name] :
                      scopes[scopes.length - 1].defs.active[token.char];
  
                    if (macro && macro.proxy) {
                      macro = macro.original;
                    }
  
                    if (macro && (macro.register || registerPrimitives.includes(macro))) {
                      let expansion = expand(token, mouth);
  
                      if (expansion.length == 1 && expansion[0] === token && token.invalid) {
                        mouth.revert();
                        break;
                      }
  
                      mouth.queue.unshift.apply(mouth.queue, expansion);
                      continue;
                    } else if (macro === data.defs.primitive.relax) {
                      break;
                    } else {
                      mouth.revert();
                      break;
                    }
                  } else if (subContext == "start" && token.cat == catcodes.WHITESPACE) {
                    continue;
                  } else if (subContext == "start" && token.cat == catcodes.OTHER &&
                    token.char == "-") {
                    sign *= -1;
                  } else if (subContext == "start" && token.cat == catcodes.OTHER &&
                    token.char == "+") {
                    continue;
                  } else if (subContext == "start" && !foundFactor && token.register) {
                    if (token.type == "integer") {
                      digits = token.value;
                      if (token.message == "decimal") {
                        digits /= 65536;
                      }
                      digits = " " + digits;
                      mouthContext = "pre space";
                      subContext = "unit start";
                    } else if (token.type == "dimension") {
                      mu = token.em.value / 65536 * 18;
                      foundUnit = true;
                    } else if (token.type == "mu dimension") {
                      mu = token.mu.value / 65536;
                      foundUnit = true;
                    } else if (token.type == "glue") {
                      mu = token.start.em.value / 65536 * 18;
                      foundUnit = true;
                    } else if (token.type == "mu glue") {
                      mu = token.start.mu.value / 65536;
                      foundUnit = true;
                    }
                    foundFactor = true;
                    if (foundUnit) {
                      break;
                    }
                    continue;
                  } else if (foundFactor && subContext == "unit start" && token.cat ==
                    catcodes.WHITESPACE) {
                    subContext = "unit start";
                  } else if (foundFactor && token.register && token.type == "mu glue") {
                    digits = parseFloat((digits + " ").replace(" .", ".").replace(". ", "") || "0");
                    mu = digits * token.start.mu.value / 65536;
                    foundUnit = true;
                    break;
                  } else if (foundFactor && (token.char == "m" || token.char == "M")) {
                    let u = mouth.eat("pre space");
                    if (u && (u.char == "u" || u.char == "U") && u.cat != catcodes.ACTIVE) {
                      mu = parseFloat((digits + " ").replace(" .", ".").replace(". ", "") || "0");
                    } else {
                      mouth.revert(2);
                      break;
                    }
                    foundUnit = true;
                  } else if (subContext == "start" && !foundFactor) {
                    mouthContext = "factor";
                    mouth.revert();
                  } else {
                    mouth.revert();
                    break;
                  }
                }
  
                if (!foundFactor || !foundUnit) {
                  return null;
                }
  
                mu *= sign;
                this.history.push({
                  queue: this.queue.slice(),
                  string: this.string,
                  history: this.history.slice()
                });
                mouth.finalize();
                this.string = mouth.string;
                return new MuDimenReg(mu * 65536);
                break;
  
              case "glue":
                // Glues are basically just three dimensions joined together. The dimension context is
                // used here to get the three dimensions, along with the factor context to get the
                // factor of any fil(l(l))s.
                mouth = new Mouth(this.string, this.queue);
                subContext = "start";
                sign = 1;
                mouthContext = "pre space";
                stretchSign = 1;
                shrinkSign = 1;
                foundShrink = false;
                foundStretch = false;
  
                while (true) {
                  let token = mouth.eat(mouthContext);
  
                  if (!token && !((subContext == "post start" || subContext == "stretch signs") &&
                    mouthContext == "dimension") && !((subContext == "post stretch" || subContext ==
                      "shrink signs") && mouthContext == "dimension")) {
                    if (lastState) {
                      mouth.loadState(lastState);
                    }
                    break;
                  }
  
                  if (!token && mouthContext == "dimension") {
                    mouthContext = "factor";
                  } else if ((subContext == "start" || subContext == "signs" || subContext ==
                    "post start" || subContext == "stretch signs" || subContext == "post stretch" ||
                    subContext == "shrink signs") && (token.type == "command" || token.type ==
                      "character" && token.cat == catcodes.ACTIVE)) {
                    let macro = token.type == "command" ?
                      scopes[scopes.length - 1].defs.primitive[token.name] ||
                      scopes[scopes.length - 1].defs.macros[token.name] ||
                      scopes[scopes.length - 1].registers.named[token.name] :
                      scopes[scopes.length - 1].defs.active[token.char];
  
                    if (macro && macro.proxy) {
                      macro = macro.original;
                    }
  
                    if (macro && (macro.register || registerPrimitives.includes(macro))) {
                      let expansion = expand(token, mouth);
  
                      if (expansion.length == 1 && expansion[0] === token && token.invalid) {
                        mouth.revert();
                        break;
                      }
                      mouth.queue.unshift.apply(mouth.queue, expansion);
                      continue;
                    } else if (macro === data.defs.primitive.relax) {
                      break;
                    } else {
                      mouth.revert();
                      break;
                    }
                  } else if ((subContext == "start" || subContext == "signs" || subContext ==
                    "post start" || subContext == "post stretch" || subContext == "stretch signs" ||
                    subContext == "shrink signs") && token.cat == catcodes.WHITESPACE) {
                    continue;
                  } else if ((subContext == "start" || subContext == "signs") && token.cat ==
                    catcodes.OTHER && token.char == "-") {
                    sign *= -1;
                    subContext = "signs";
                  } else if ((subContext == "start" || subContext == "signs") && token.cat ==
                    catcodes.OTHER && token.char == "+") {
                    subContext = "signs";
                  } else if ((subContext == "start" || subContext == "signs") && token.register &&
                    token.type == "glue") {
                    start =
                      new DimenReg(token.start.sp.value * sign, token.start.em.value * sign);
                    stretch =
                      new DimenReg(token.stretch.sp.value * sign, token.stretch.em.value * sign);
                    shrink =
                      new DimenReg(token.shrink.sp.value * sign, token.shrink.em.value * sign);
                    foundStretch = foundShrink = true;
                    break;
                  } else if ((subContext == "start" || subContext == "signs") && token.register &&
                    token.type == "dimension") {
                    start = new DimenReg(token.sp.value * sign, token.em.value * sign);
                    subContext = "post start";
                    mouthContext = "pre space";
                    mouth.saveState(lastState = Symbol());
                  } else if (subContext == "start" || subContext == "signs") {
                    mouthContext = "dimension";
                    mouth.revert();
                  } else if (subContext == "post start" && start && !foundStretch && !foundShrink &&
                    token.char == "p") {
                    let l = mouth.eat("pre space");
                    if (l && (l.char == "l" || l.char == "L") && l.cat != catcodes.ACTIVE) {
                      let u = mouth.eat("pre space");
                      if (u && (u.char == "u" || u.char == "U") && u.cat != catcodes.ACTIVE) {
                        let s = mouth.eat("pre space");
                        if (s && (s.char == "s" || s.char == "S") && s.cat != catcodes.ACTIVE) {
                          foundStretch = true;
                          continue;
                        }
                      }
                    }
                    mouth.loadState(lastState);
                    break;
                  } else if (subContext == "post start" && foundStretch && token.cat == catcodes.OTHER
                    && token.char == "-") {
                    stretchSign *= -1;
                    subContext = "stretch signs";
                  } else if (subContext == "post start" && foundStretch && token.cat == catcodes.OTHER
                    && token.char == "+") {
                    subContext = "stretch signs";
                  } else if ((subContext == "post start" || subContext == "stretch signs") &&
                    foundStretch && token.register && token.type == "dimension") {
                    stretch = new DimenReg(token.sp.value * stretchSign, token.em.value * shrinkSign);
                    subContext = "post stretch";
                    mouthContext = "pre space";
                    mouth.saveState(lastState = Symbol());
                  } else if ((subContext == "post start" || subContext == "stretch signs") &&
                    foundStretch && token.register && token.type == "integer") {
                    mouthContext = "pre space";
                    let f = mouth.eat();
                    if (f && (f.char == "f" || f.char == "F") && f.cat != catcodes.ACTIVE) {
                      let i = mouth.eat("pre space");
                      if (i && (i.char == "i" || i.char == "I") && i.cat != catcodes.ACTIVE) {
                        let l = mouth.eat("pre space");
                        if (l && (l.char == "l" || l.char == "L") && l.cat != catcodes.ACTIVE) {
                          l = mouth.eat("pre space");
                          if (l && (l.char == "l" || l.char == "L") && l.cat != catcodes.ACTIVE) {
                            l = mouth.eat("pre space");
                            if (l && (l.char == "l" || l.char == "L") && l.cat != catcodes.ACTIVE) {
                              stretch = new InfDimen(token.value * stretchSign, 3);
                            } else {
                              if (l) {
                                mouth.revert();
                              }
                              stretch = new InfDimen(token.value * stretchSign, 2);
                            }
                          } else {
                            if (l) {
                              mouth.revert();
                            }
                            stretch = new InfDimen(token.value * stretchSign, 1);
                          }
                          subContext = "post stretch";
                          mouth.saveState(lastState = Symbol());
                          continue;
                        }
                      }
                    }
                    mouth.loadState(lastState);
                    break;
                  } else if ((subContext == "post start" || subContext == "stretch signs") &&
                    foundStretch) {
                    mouthContext = "dimension";
                    mouth.revert();
                  } else if ((subContext == "post start" && !foundStretch || subContext ==
                    "post stretch") && !foundShrink && token.char == "m") {
                    let i = mouth.eat("pre space");
                    if (i && (i.char == "i" || i.char == "I") && i.cat != catcodes.ACTIVE) {
                      let n = mouth.eat("pre space");
                      if (n && (n.char == "n" || n.char == "N") && n.cat != catcodes.ACTIVE) {
                        let u = mouth.eat("pre space");
                        if (u && (u.char == "u" || u.char == "U") && u.cat != catcodes.ACTIVE) {
                          let s = mouth.eat("pre space");
                          if (s && (s.char == "s" || s.char == "S") && s.cat != catcodes.ACTIVE) {
                            foundShrink = true;
                            continue;
                          }
                        }
                      }
                    }
                    mouth.loadState(lastState);
                    break;
                  } else if (subContext == "post stretch" && foundShrink &&
                    token.cat == catcodes.OTHER && token.char == "-") {
                    shrinkSign *= -1;
                    subContext = "shrink signs";
                  } else if (subContext == "post stretch" && foundShrink &&
                    token.cat == catcodes.OTHER && token.char == "+") {
                    subContext = "shrink signs";
                  } else if ((subContext == "post stretch" || subContext == "shrink signs" ||
                    subContext == "post start") && foundShrink && token.register &&
                    token.type == "dimension") {
                    shrink = new DimenReg(token.sp.value * shrinkSign, token.em.value * shrinkSign);
                    break;
                  } else if ((subContext == "post stretch" || subContext == "shrink signs" ||
                    subContext == "post start") && foundShrink && token.register &&
                    token.type == "integer") {
                    let f = mouth.eat();
                    if (f && (f.char == "f" || f.char == "F") && f.cat != catcodes.ACTIVE) {
                      let i = mouth.eat("pre space");
                      if (i && (i.char == "i" || i.char == "I") && i.cat != catcodes.ACTIVE) {
                        let l = mouth.eat("pre space");
                        if (l && (l.char == "l" || l.char == "L") && l.cat != catcodes.ACTIVE) {
                          l = mouth.eat("pre space");
                          if (l && (l.char == "l" || l.char == "L") && l.cat != catcodes.ACTIVE) {
                            l = mouth.eat("pre space");
                            if (l && (l.char == "l" || l.char == "L") && l.cat != catcodes.ACTIVE) {
                              shrink = new InfDimen(token.value * shrinkSign, 3);
                            } else {
                              if (l) {
                                mouth.revert();
                              }
                              shrink = new InfDimen(token.value * shrinkSign, 2);
                            }
                          } else {
                            if (l) {
                              mouth.revert();
                            }
                            shrink = new InfDimen(token.value * shrinkSign, 1);
                          }
                          break;
                        }
                      }
                    }
                    mouth.loadState(lastState);
                    break;
                  } else if ((subContext == "post stretch" || subContext == "shrink signs" ||
                    subContext == "post start") && foundShrink) {
                    mouthContext = "dimension";
                    mouth.revert();
                  } else {
                    if (lastState) {
                      mouth.loadState(lastState);
                    } else {
                      mouth.revert();
                    }
                    break;
                  }
                }
  
                if (!start) {
                  return null;
                }
  
                this.history.push({
                  queue: this.queue.slice(),
                  string: this.string,
                  history: this.history.slice()
                });
                mouth.finalize();
                this.string = mouth.string;
                return new GlueReg(start, stretch, shrink);
                break;
  
              case "mu glue":
                // Same as glue but with math units.
                mouth = new Mouth(this.string, this.queue);
                subContext = "start";
                sign = 1;
                mouthContext = "pre space";
                stretchSign = 1;
                shrinkSign = 1;
                foundShrink = false;
                foundStretch = false;
  
                while (true) {
                  let token = mouth.eat(mouthContext);
  
                  if (!token && !((subContext == "post start" || subContext == "stretch signs") &&
                    mouthContext == "mu dimension") && !((subContext == "post stretch" ||
                    subContext == "shrink signs") && mouthContext == "mu dimension")) {
                    if (lastState) {
                      mouth.loadState(lastState);
                    }
                    break;
                  }
  
                  if (!token && mouthContext == "mu dimension") {
                    mouthContext = "factor";
                  } else if ((subContext == "start" || subContext == "signs" || subContext ==
                    "post start" || subContext == "stretch signs" || subContext == "post stretch" ||
                    subContext == "shrink signs") && (token.type == "command" || token.type ==
                      "character" && token.cat == catcodes.ACTIVE)) {
                    let macro = token.type == "command" ?
                      scopes[scopes.length - 1].defs.primitive[token.name] ||
                      scopes[scopes.length - 1].defs.macros[token.name] ||
                      scopes[scopes.length - 1].registers.named[token.name] :
                      scopes[scopes.length - 1].defs.active[token.char];
  
                    if (macro && macro.proxy) {
                      macro = macro.original;
                    }
  
                    if (macro && (macro.register || registerPrimitives.includes(macro))) {
                      let expansion = expand(token, mouth);
  
                      if (expansion.length == 1 && expansion[0] === token && token.invalid) {
                        mouth.revert();
                        break;
                      }
                      mouth.queue.unshift.apply(mouth.queue, expansion);
                      continue;
                    } else if (macro === data.defs.primitive.relax) {
                      break;
                    } else {
                      mouth.revert();
                      break;
                    }
                  } else if ((subContext == "start" || subContext == "signs" || subContext ==
                    "post start" || subContext == "post stretch" || subContext == "stretch signs" ||
                    subContext == "shrink signs") && token.cat == catcodes.WHITESPACE) {
                    continue;
                  } else if ((subContext == "start" || subContext == "signs") && token.cat ==
                    catcodes.OTHER && token.char == "-") {
                    sign *= -1;
                    subContext = "signs";
                  } else if ((subContext == "start" || subContext == "signs") && token.cat ==
                    catcodes.OTHER && token.char == "+") {
                    subContext = "signs";
                  } else if ((subContext == "start" || subContext == "signs") && token.register &&
                    token.type == "mu glue") {
                    start = new MuDimenReg(token.start.mu.value * sign);
                    stretch = new MuDimenReg(token.stretch.mu.value * sign);
                    shrink = new MuDimenReg(token.shrink.mu.value * sign);
                    foundStretch = foundShrink = true;
                    break;
                  } else if ((subContext == "start" || subContext == "signs") && token.register &&
                    token.type == "mu dimension") {
                    start = new MuDimenReg(token.mu.value * sign);
                    subContext = "post start";
                    mouthContext = "pre space";
                    mouth.saveState(lastState = Symbol());
                  } else if (subContext == "start" || subContext == "signs") {
                    mouthContext = "mu dimension";
                    mouth.revert();
                  } else if (subContext == "post start" && start && !foundStretch && !foundShrink &&
                    token.char == "p") {
                    let l = mouth.eat("pre space");
                    if (l && (l.char == "l" || l.char == "L") && l.cat != catcodes.ACTIVE) {
                      let u = mouth.eat("pre space");
                      if (u && (u.char == "u" || u.char == "U") && u.cat != catcodes.ACTIVE) {
                        let s = mouth.eat("pre space");
                        if (s && (s.char == "s" || s.char == "S") && s.cat != catcodes.ACTIVE) {
                          foundStretch = true;
                          continue;
                        }
                      }
                    }
                    mouth.loadState(lastState);
                    break;
                  } else if (subContext == "post start" && foundStretch && token.cat == catcodes.OTHER
                    && token.char == "-") {
                    stretchSign *= -1;
                    subContext = "stretch signs";
                  } else if (subContext == "post start" && foundStretch && token.cat == catcodes.OTHER
                    && token.char == "+") {
                    subContext = "stretch signs";
                  } else if ((subContext == "post start" || subContext == "stretch signs") &&
                    foundStretch && token.register && token.type == "mu dimension") {
                    stretch = new MuDimenReg(token.mu.value * stretchSign);
                    subContext = "post stretch";
                    mouthContext = "pre space";
                    mouth.saveState(lastState = Symbol());
                  } else if ((subContext == "post start" || subContext == "stretch signs") &&
                    foundStretch && token.register && token.type == "integer") {
                    mouthContext = "pre space";
                    let f = mouth.eat();
                    if (f && (f.char == "f" || f.char == "F") && f.cat != catcodes.ACTIVE) {
                      let i = mouth.eat("pre space");
                      if (i && (i.char == "i" || i.char == "I") && i.cat != catcodes.ACTIVE) {
                        let l = mouth.eat("pre space");
                        if (l && (l.char == "l" || l.char == "L") && l.cat != catcodes.ACTIVE) {
                          l = mouth.eat("pre space");
                          if (l && (l.char == "l" || l.char == "L") && l.cat != catcodes.ACTIVE) {
                            l = mouth.eat("pre space");
                            if (l && (l.char == "l" || l.char == "L") && l.cat != catcodes.ACTIVE) {
                              stretch = new InfDimen(token.value * stretchSign, 3);
                            } else {
                              mouth.revert();
                              stretch = new InfDimen(token.value * stretchSign, 2);
                            }
                          } else {
                            mouth.revert();
                            stretch = new InfDimen(token.value * stretchSign, 1);
                          }
                          subContext = "post stretch";
                          mouth.saveState(lastState = Symbol());
                          continue;
                        }
                      }
                    }
                    mouth.loadState(lastState);
                    break;
                  } else if ((subContext == "post start" || subContext == "stretch signs") &&
                    foundStretch) {
                    mouthContext = "mu dimension";
                    mouth.revert();
                  } else if ((subContext == "post start" && !foundStretch || subContext ==
                    "post stretch") && !foundShrink && token.char == "m") {
                    let i = mouth.eat("pre space");
                    if (i && (i.char == "i" || i.char == "I") && i.cat != catcodes.ACTIVE) {
                      let n = mouth.eat("pre space");
                      if (n && (n.char == "n" || n.char == "N") && n.cat != catcodes.ACTIVE) {
                        let u = mouth.eat("pre space");
                        if (u && (u.char == "u" || u.char == "U") && u.cat != catcodes.ACTIVE) {
                          let s = mouth.eat("pre space");
                          if (s && (s.char == "s" || s.char == "S") && s.cat != catcodes.ACTIVE) {
                            foundShrink = true;
                            continue;
                          }
                        }
                      }
                    }
                    mouth.loadState(lastState);
                    break;
                  } else if (subContext == "post stretch" && foundShrink &&
                    token.cat == catcodes.OTHER && token.char == "-") {
                    shrinkSign *= -1;
                    subContext = "shrink signs";
                  } else if (subContext == "post stretch" && foundShrink &&
                    token.cat == catcodes.OTHER && token.char == "+") {
                    subContext = "shrink signs";
                  } else if ((subContext == "post stretch" || subContext == "shrink signs" ||
                    subContext == "post start") && foundShrink && token.register &&
                    token.type == "mu dimension") {
                    shrink = new MuDimenReg(token.mu.value * shrinkSign);
                    break;
                  } else if ((subContext == "post stretch" || subContext == "shrink signs" ||
                    subContext == "post start") && foundShrink && token.register &&
                    token.type == "integer") {
                    let f = mouth.eat();
                    if (f && (f.char == "f" || f.char == "F") && f.cat != catcodes.ACTIVE) {
                      let i = mouth.eat("pre space");
                      if (i && (i.char == "i" || i.char == "I") && i.cat != catcodes.ACTIVE) {
                        let l = mouth.eat("pre space");
                        if (l && (l.char == "l" || l.char == "L") && l.cat != catcodes.ACTIVE) {
                          l = mouth.eat("pre space");
                          if (l && (l.char == "l" || l.char == "L") && l.cat != catcodes.ACTIVE) {
                            l = mouth.eat('pre space');
                            if (l && (l.char == "l" || l.char == "L") && l.cat != catcodes.ACTIVE) {
                              shrink = new InfDimen(token.value * shrinkSign, 3);
                            } else {
                              shrink = new InfDimen(token.value * shrinkSign, 2);
                            }
                          } else {
                            shrink = new InfDimen(token.value * shrinkSign, 1);
                          }
                          break;
                        }
                      }
                    }
                    mouth.loadState(lastState);
                    break;
                  } else if ((subContext == "post stretch" || subContext == "shrink signs" ||
                    subContext == "post start") && foundShrink) {
                    mouthContext = "mu dimension";
                    mouth.revert();
                  } else {
                    if (lastState) {
                      mouth.loadState(lastState);
                    } else {
                      mouth.revert();
                    }
                    break;
                  }
                }
  
                if (!start) {
                  return null;
                }
  
                this.history.push({
                  queue: this.queue.slice(),
                  string: this.string,
                  history: this.history.slice()
                });
                mouth.finalize();
                this.string = mouth.string;
                return new MuGlueReg(start, stretch, shrink);
                break;
  
              case "unsigned int":
                // This context looks for integers, like the integer context, except coerced integers
                // (dimensions and glues cast into integers) and plus & minus signs aren't allowed.
                // This context is used directly in the integer context and the factor context.
                mouth = new Mouth(this.string, this.queue);
                subContext = "start";
                digits = 0;
                found = false;
  
                while (true) {
                  let token = mouth.eat("pre space");
  
                  if (!token) {
                    break;
                  }
  
                  // If the current context is "grave", then the last token that was parsed was a
                  // grave character (`). It makes the next token act as a number. If it's a character
                  // token, the code point of the character is used. If it's a command token, the to-
                  // ken can only be one character in length and the code point of that one character
                  // is used instead. This context has to come first because commands aren't supposed
                  // to be expanded. If the command expansion if block came first, it would be incor-
                  // rectly expanded.
                  if (subContext == "grave") {
                    // Only a one-character-long command or an actual character can follow a grave
                    // character (`). If the command is more than one character long, then the whole
                    // number search is aborted and null is returned.
                    if (token.type == "command" && token.name.length == 1) {
                      digits = token.name.codePointAt(0);
                    } else if (token.type == "character") {
                      digits = token.char.codePointAt(0);
                    } else {
                      return null;
                    }
                    found = true;
                    break;
                  } else if (subContext == "start" && (token.type == "command" || token.type ==
                    "character" && token.cat == catcodes.ACTIVE)) {
                    let macro = token.type == "command" ?
                      scopes[scopes.length - 1].defs.primitive[token.name] ||
                      scopes[scopes.length - 1].defs.macros[token.name] ||
                      scopes[scopes.length - 1].registers.named[token.name] :
                      scopes[scopes.length - 1].defs.active[token.char];
  
                    if (macro && macro.proxy) {
                      macro = macro.original;
                    }
  
                    if (macro && (macro.register || registerPrimitives.includes(macro))) {
                      let expansion = expand(token, mouth);
  
                      if (expansion.length == 1 && expansion[0] === token && token.invalid) {
                        mouth.revert();
                        break;
                      }
  
                      mouth.queue.unshift.apply(mouth.queue, expansion);
                      continue;
                    } else if (macro === data.defs.primitive.relax) {
                      break;
                    } else {
                      mouth.revert();
                      break;
                    }
                  } else if (subContext == "start" && token.cat == catcodes.WHITESPACE) {
                    continue;
                  } else if (subContext == "start" && token.register && token.type == "integer") {
                    // An integer register was found. Only integer registers are allowed here. The
                    // register's value is copied into a new integer registered and returned.
                    digits = token.value;
                    found = true;
                    break;
                  } else if ((subContext == "decimal" || subContext == "start") && token.cat ==
                    catcodes.OTHER && 47 < token.code && token.code < 58) {
                    // A regular digit (0-9) was found. The context changes and a new digit is added
                    // to `digits'.
                    digits = digits * 10 + parseInt(token.char, 10);
                    subContext = "decimal";
                    found = true;
                  } else if (subContext == "start" && token.cat == catcodes.OTHER &&
                    token.char == "'") {
                    // An octal indicator (') was found. Only octal digits are allowed after it.
                    subContext = "octal";
                  } else if (subContext == "start" && token.cat == catcodes.OTHER &&
                    token.char == '"') {
                    // A hexadecimal indicator (") was found. Only hexadecimal digits are allowed
                    // after it.
                    subContext = "hexadecimal";
                  } else if (subContext == "start" && token.cat == catcodes.OTHER &&
                    token.char == "`") {
                    // A grave character was found (`). The next token should be a character or a sin-
                    // gle character command. All that is handled above. This just changes the con-
                    // text.
                    subContext = "grave";
                  } else if (subContext == "octal" && token.cat == catcodes.OTHER &&
                    47 < token.code && token.code < 56) {
                    digits = digits * 8 + parseInt(token.char, 8);
                    found = true;
                  } else if (subContext == "hexadecimal" && ((token.cat == catcodes.OTHER &&
                    47 < token.code && token.code < 58) || ((token.cat == catcodes.OTHER ||
                      token.cat == catcodes.LETTER) && 64 < token.code && token.code < 71))) {
                    digits = digits * 16 + parseInt(token.char, 16);
                    found = true;
                  } else {
                    // A character was found that's not part of the number. Put the token back and
                    // finish parsing.
                    mouth.revert();
                    break;
                  }
                }
  
                if (!found) {
                  return null;
                }
  
                this.history.push({
                  queue: this.queue.slice(),
                  string: this.string,
                  history: this.history.slice()
                });
                mouth.finalize();
                this.string = mouth.string;
                return new IntegerReg(digits);
                break;
  
              case "factor":
                // This context is like a decimal context. It looks for any unsigned number and uses
                // the unsigned int context to look for regular integers. It can also find fractional\
                // decimals though that use either a period or a comma as the decimal point. This con-
                // text is used in the dimension and glue context. The reason it's called "factor" in-
                // stead of "unsigned decimal" or something is because it is combined with a unit
                // (e.g. 1.5em). It acts as a factor for a unit. Since decimal values are allowed
                // here, but integer registers don't allow for decimals, the value gotten here is mul-
                // tiplied by 65536. That way, a decimal like 0.5 can still be represented using the
                // value 65536 * 0.5 = 32768.
                mouth = new Mouth(this.string, this.queue);
                subContext = "start";
                digits = "";
                found = false;
                mouthContext = "pre space";
  
                while (true) {
                  let token = mouth.eat(mouthContext);
  
                  if (!token) {
                    break;
                  }
  
                  if (subContext == "start" && (token.type == "command" ||
                    token.type == "character" && token.cat == catcodes.ACTIVE)) {
                    let macro = token.type == "command" ?
                      scopes[scopes.length - 1].defs.primitive[token.name] ||
                      scopes[scopes.length - 1].defs.macros[token.name] ||
                      scopes[scopes.length - 1].registers.named[token.name] :
                      scopes[scopes.length - 1].defs.active[token.char];
  
                    if (macro && macro.proxy) {
                      macro = macro.original;
                    }
  
                    if (macro && (macro.register || registerPrimitives.includes(macro))) {
                      let expansion = expand(token, mouth);
  
                      if (expansion.length == 1 && expansion[0] === token && token.invalid) {
                        mouth.revert();
                        break;
                      }
                      mouth.queue.unshift.apply(mouth.queue, expansion);
                      continue;
                    } else if (macro === data.defs.primitive.relax) {
                      break;
                    } else {
                      mouth.revert();
                      break;
                    }
                  } else if (subContext == "start" && token.cat == catcodes.WHITESPACE) {
                    continue;
                  } else if (subContext == "start" && token.register && token.type == "integer") {
                    digits = token.value.toString();
                    found = true;
                    break;
                  } else if ((subContext == "pre decimal" || subContext == "start") &&
                    token.cat == catcodes.OTHER && 47 < token.code && token.code < 58) {
                    digits += token.char;
                    subContext = "pre decimal";
                    found = true;
                  } else if ((subContext == "pre decimal" || subContext == "start") &&
                    token.cat == catcodes.OTHER && (token.char == "." || token.char == ",")) {
                    digits += ".";
                    subContext = "post decimal";
                    found = true;
                  } else if (subContext == "post decimal" && token.cat == catcodes.OTHER &&
                    47 < token.code && token.code < 58) {
                    digits += token.char;
                  } else if (subContext == "start") {
                    mouthContext = "unsigned int";
                    mouth.revert();
                  } else {
                    mouth.revert();
                    break;
                  }
                }
  
                if (!found) {
                  return null;
                }
  
                this.history.push({
                  queue: this.queue.slice(),
                  string: this.string,
                  history: this.history.slice()
                });
                mouth.finalize();
                this.string = mouth.string;
                return new IntegerReg(digits * 65536, null, null, "decimal");
                break;
            }
          };
  
          // The `preview` function basically calls the eat function, saves the token, reverts the
          // eating, and returns the token. It lets the caller get the first token of the string/queue
          // without making any changes to it.
          this.preview = function (context) {
            let token = this.eat(context);
            if (token) {
              this.revert();
            }
            return token;
          };
  
          // The `revert` function will revert the previous token. Basically, the Mouth object's data
          // will be rolled back to before the last token was parsed. This function does not revert
          // finalized changes unless it's rolled back far enough and then finalized again. If a nu-
          // merical argument is provided, that function is repeated that many times.
          this.revert = function (times) {
            for (times = typeof times == "number" ? times : 1; times > 0; times--) {
              // If there is no history to go based off of, just return immediately
              if (this.history.length == 0) {
                return;
              }
              // Replace all the data with the old data.
              this.string = this.history[this.history.length - 1].string;
              for (let i = 0, l = this.history[this.history.length - 1].queue.length; i < l; i++) {
                this.queue[i] = this.history[this.history.length - 1].queue[i];
              }
              this.queue.length = this.history[this.history.length - 1].queue.length;
              this.history = this.history[this.history.length - 1].history;
            }
          };
  
          // The `finalize` function will change the original queue array so that any changes made in
          // this function will be finalized. If an input string was provided as an argument, it's up
          // to the calling function to change the original string since strings are immutable and the
          // reference to the string can't be changed. If no string was provided though, the outer
          // `string' variable will be changed.
          this.finalize = function () {
            for (let i = 0, l = this.queue.length; i < l; i++) {
              (customQueue || queue)[i] = this.queue[i];
            }
            (customQueue || queue).length = this.queue.length;
            if (typeof customString != "string") {
              string = this.string;
            }
          };
  
          // The `saveState` function, when called, saves the current state of the mouth in the
          // `savedStates` object. Then later, the Mouth can be restored back to the state that was
          // saved. It's like the revert function, except it doesn't have to revert only to the last
          // action.
          this.saveState = function (label) {
            this.savedStates[label] = {
              queue: this.queue.slice(),
              string: this.string,
              history: this.history.slice()
            };
          };
  
          this.loadState = function loadState(label) {
            this.string = this.savedStates[label].string;
            this.history = this.savedStates[label].history;
            for (let i = 0, l = this.savedStates[label].queue.length; i < l; i++) {
              this.queue[i] = this.savedStates[label].queue[i];
            }
            this.queue.length = this.savedStates[label].queue.length;
          };
  
          // The `expand` function will expand a command or active character token. If its token argu-
          // ment is not a command or active character token, the token is returned by itself in an
          // array. Otherwise, the command/active character token is looked up in the last Scope to
          // replace it with its definition. The `mouth` argument is used in case the command is a
          // primitive that needs access to the next tokens. Usually though, the mouth isn't even used
          // at all.
          function expand(token, mouth) {
            if (!mouth) {
              mouth = this;
            }
  
            // First, check that the token is actually expandable.
            if (token && (token.type == "command" || token.type == "character" && token.cat ==
              catcodes.ACTIVE)) {
              // Check if the token is invalid. If it is, that means it's already been expanded and
              // failed. There's not point trying again. Just return an empty array.
              if (token.invalid) {
                let tokens = (token.type == "command" ?
                  token.escapeChar + token.name :
                  token.char).split("");
                tokens = tokens.map(element => ({
                  type: "character",
                  cat: catcodes.OTHER,
                  char: element,
                  code: element.codePointAt(0),
                  invalid: true,
                  recognized: token.recognized
                }));
  
                return [{
                  type: "character",
                  cat: catcodes.OPEN,
                  char: "{",
                  code: "{".codePointAt(0),
                  invalid: true
                }].concat(tokens).concat({
                  type: "character",
                  cat: catcodes.CLOSE,
                  char: "}",
                  code: "}".codePointAt(0),
                  invalid: true
                });
              };
  
              // A token can also be ignorable. In which case, just return an empty array. This is
              // used in case the token isn't invalid, but still needs to be skipped over.
              if (token.ignore) {
                return [{
                  type: "ignored command",
                  token: token
                }];
              }
  
              let lastScope = scopes[scopes.length - 1];
  
              // Now, make sure the token has an actual definition.
              if (token.type == "command") {
                // Look it up in the macro and primitive command objects.
                if (token.name in lastScope.defs.macros) {
                  let macro = lastScope.defs.macros[token.name];
  
                  if (macro.proxy) {
                    macro = macro.original;
                  }
  
                  // The command is a user-defined macro. It might be a simple replacement macro, or a
                  // \let for a primitive command.
                  if (macro.type == "primitive") {
                    // It's a primitive command. Run the primitive command's function.
                    let queuedToks = macro.function.call(token, {
                      mouth: mouth,
                      tokens: lastScope.tokens,
                      toggles: prefixedToggles,
                      catOf: catOf,
                      mathCodeOf: mathCodeOf,
                      scopes: scopes,
                      lastScope: scopes[scopes.length - 1],
                      openGroups: openGroups,
                      contexts: contexts,
                      lastContext: contexts[contexts.length - 1] || {},
                      Scope: Scope,
                      style: style
                    });
                    // Indicate that this macro name was recognized.
                    token.recognized = true;
                    // The primitive function should return a list of tokens for the queue, or nothing
                    // at all.
                    return Array.isArray(queuedToks) ? queuedToks : [];
                  } else {
                    // It's a regular replacement macro. Substitute arguments in the replacement to-
                    // kens for parameters, and return an array of the tokens.
                    token.recognized = true;
  
                    // Create a saved state in the Mouth in case the expansion fails.
                    let macroExpandSym = Symbol();
                    mouth.saveState(macroExpandSym);
  
                    // The `params` array keeps track of arguments to pass into the replacement text.
                    let params = [];
  
                    // First, iterate through the macro's parameter tokens to look for arguments (e.g.
                    // "#1").
                    for (let i = 0, l = macro.parameters.length; i < l; i++) {
                      // There are two types of tokens: those with a param catcode (catcode 6), and
                      // all other characters. If it is a parameter, the tokens in the macro call will
                      // act as arguments to be be used in the expansion text. If it's not a parameter
                      // character, it should match exactly with the tokens after the macro call.
                      let tok = macro.parameters[i];
                      if (tok.cat == catcodes.PARAMETER) {
                        // There can be two types of parameters. A parameter is considered delimited
                        // if there are non-parameter tokens after it. Tokens will be absorbed until
                        // the closing delimiter token is found. If a parameter is not delimited, only
                        // a single token or group is absorbed and used as the argument.
                        // Check if the token is delimited.
                        if (macro.parameters[i + 1] &&
                          macro.parameters[i + 1].cat != catcodes.PARAMETER) {
                          // The token is delimited. Scan for tokens until the next tokens are found.
                          // Keep track of what tokens to look out for.
                          let nextIndex = macro.parameters.map(
                            token => token.cat == catcodes.PARAMETER
                          ).indexOf(true, i + 1);
                          let next = macro.parameters.slice(
                            i + 1,
                            ~nextIndex ? nextIndex : Infinity
                          );
  
                          // Add an array to `params`. Tokens will be added there.
                          params.push([]);
  
                          // This number keeps track of how many actual arguments were parsed. This
                          // may be different from the number of tokens that were parsed. For example,
                          // if "{hi}" is found, then it only counts as one argument, but as four to-
                          // kens.
                          let tokensParsed = 0;
  
                          // Continuously scan until the `next` tokens are found.
                          while (true) {
                            let otherTok = mouth.eat("argument");
  
                            // If the string runs out of tokens, the call doesn't match its definition
                            // and the original token should be returned as invalid.
                            if (!otherTok) {
                              token.invalid = true;
                              mouth.loadState(macroExpandSym);
                              return [token];
                            }
  
                            // If this is the only token, check if it is the start of the next tokens
                            // list.
                            if (otherTok.length == 1) {
                              // To check if the next few tokens matches the `next` array of tokens,
                              // iterate over the next few tokens in the stream and check if they
                              // match.
                              let currentTok = otherTok;
                              let argAbsorbSym = Symbol();
                              let isDone = false;
                              // Save the state so we can go back to before we started scanning ahead.
                              mouth.saveState(argAbsorbSym);
  
                              for (let nextIndex = 0; nextIndex < next.length; nextIndex++) {
                                // Check if this token does not match, and break the loop if so.
                                if (!currentTok ||
                                  (currentTok.length != 1 &&
                                    (next[nextIndex].cat != catcodes.OPEN ||
                                      nextIndex != next.length - 1)) ||
                                  currentTok[0].type != next[nextIndex].type ||
                                  currentTok[0].cat != next[nextIndex].cat ||
                                  currentTok[0].code != next[nextIndex].code ||
                                  currentTok[0].name != next[nextIndex].name) {
                                  break;
                                }
  
                                // If all the tokens matched, mark `isDone` to true and break.
                                if (nextIndex == next.length - 1) {
                                  isDone = true;
                                  break;
                                }
  
                                // Look at the next token.
                                currentTok = mouth.eat("argument");
                              }
  
                              // Go back to before we started scanning.
                              mouth.loadState(argAbsorbSym);
  
                              // If the tokens all matched, go back once to before we had started
                              // scanning.
                              if (isDone) {
                                mouth.revert();
                                break;
                              }
                            }
  
                            // The current token is not the delimiting closing token. It will be coun-
                            // ted as part of the argument and the scanning should continue.
                            params[params.length - 1] = params[params.length - 1].concat(otherTok);
  
                            // Increment `tokensParsed`.
                            tokensParsed++;
                          }
                          // TeX removes the enclosing opening and closing tokens around an argument
                          // as long as it won't unbalance the group delimiters. If `tokensParsed' is
                          // just one, then opening and closing delimiters can be stripped. If it's
                          // more than one though, then they can't (because then there would be an un-
                          // matched closing token in the middle and an unmatched opening token after
                          // it).
                          if (tokensParsed == 1 &&
                            params[params.length - 1][0].cat == catcodes.OPEN &&
                            params[params.length - 1][params[params.length - 1].length - 1].cat ==
                            catcodes.CLOSE) {
                            params[params.length - 1].shift();
                            params[params.length - 1].pop();
                          }
                        } else {
                          // The token is not delimited. Only one token should be absorbed and used as
                          // the argument.
                          let otherTok = mouth.eat("argument");
  
                          // If there are no more tokens, return as an invalid command call.
                          if (!otherTok) {
                            token.invalid = true;
                            mouth.loadState(macroExpandSym);
                            return [token];
                          }
  
                          // If `otherTok` is more than just one token, it had to have been surrounded
                          // by opening and closing delimiters, which TeX strips off automatically. If
                          // it's only two characters though, then both must be an opening and closing
                          // tokens. In that case, don't strip them off because then it'll just be an
                          // empty array.
                          if (otherTok.length > 2) {
                            otherTok.shift();
                            otherTok.pop();
                          }
  
                          // The token counts as an argument for the expansion.
                          params.push(otherTok);
                        }
                      } else {
                        // The token is not a parameter. It should be the same as the next token in
                        // the macro call tokens.
                        let otherTok = mouth.eat();
                        // Check that the two tokens match.
                        if (!tok ||
                          !otherTok ||
                          tok.type != otherTok.type ||
                          tok.cat != otherTok.cat ||
                          tok.code != otherTok.code ||
                          tok.name != otherTok.name) {
                          // The token does not match. The macro call does not match its definition
                          // and an error would be thrown. Add an `invalid' property and return the
                          // initial token.
                          token.invalid = true;
                          // Revert the mouth to its original state before expansion.
                          mouth.loadState(macroExpandSym);
                          return [token];
                        }
                        // The two tokens match. No action needs to be taken.
                      }
                    }
  
                    // All parameters have been found. Arguments are stored in the `params` array. The
                    // replacement tokens can reference arguments by their index. All that's left to
                    // do is evaluate the replacement tokens. Parameter tokens followed by a number
                    // (e.g., #1) will be replaced by the corresponding arguments. Parameter tokens
                    // followed by another parameter token (e.g. ##) will be evaluated simply as a
                    // single parameter token. That lets other \def commands happen in replacement to-
                    // kens (e.g.
                    //   \def\cmdOne{\def\cmdTwo##1{##1}},
                    // when called, will be replaced with the tokens
                    //   \def\cmdTwo#1{#1}).
                    // `replacement` keeps track of the actual tokens that will be returned. These are
                    // the tokens that will be evaluated as a replacement for the macro.
                    let replacement = [];
  
                    // Loop through the tokens, replacing parameter tokens in the process.
                    for (let i = 0, l = macro.replacement.length; i < l; i++) {
                      // Check if the current token is a parameter token.
                      if (macro.replacement[i].cat == catcodes.PARAMETER) {
                        if (macro.replacement[i + 1].cat == catcodes.PARAMETER) {
                          // Replace with a regular parameter token (by deleting the first of the two
                          // parameter tokens).
                          replacement.push(macro.replacement[i + 1]);
                          i++;
                        } else {
                          // Look at the next token. It should be a number between 1-9 indicating
                          // which argument should be used to replace it.
                          let index = macro.replacement[i + 1].char - 1;
  
                          // If the index is out of order, mark it as invalid.
                          if (index > params.length) {
                            replacement = replacement.concat({
                              type: "character",
                              cat: catcodes.OTHER,
                              char: macro.replacement[i].char,
                              code: macros.replacement[i].code,
                              invalid: true
                            });
                          }
                          // Otherwise add the argument that was passed in for this index.
                          else {
                            replacement = replacement.concat(params[index]);
                            i++;
                          }
                        }
                      } else {
                        // The token is a regular token. Clone it and add it directly to
                        // `replacement`. A clone is made in case there is a problem while parsing the
                        // replacement, to leave the original intact. If there *is* a problem, an
                        // `invalid` property might be added to a token, but that should not affect
                        // the original macro because then all subsequent calls to the macro will also
                        // inherit that `invalid` property, even if it's not actually invalid.
                        let clone = {};
                        for (let key in macro.replacement[i]) {
                          clone[key] = macro.replacement[i][key];
                        }
                        replacement.push(clone);
                      }
                    }
  
                    return replacement;
                  }
                } else if (token.name in lastScope.defs.primitive) {
                  // The command is a primitive. Do the same thing that was done above where the
                  // function is called.
                  let queuedToks = lastScope.defs.primitive[token.name].function.call(token, {
                    mouth: mouth,
                    tokens: lastScope.tokens,
                    toggles: prefixedToggles,
                    catOf: catOf,
                    scopes: scopes,
                    lastScope: scopes[scopes.length - 1],
                    openGroups: openGroups,
                    contexts: contexts,
                    lastContext: contexts[contexts.length - 1] || {},
                    Scope: Scope,
                    style: style
                  });
                  token.recognized = true;
                  return Array.isArray(queuedToks) ? queuedToks : [];
                } else if (token.name in lastScope.registers.named) {
                  // The token points to a register. Return the value of the register.
                  return [lastScope.registers.named[token.name]];
                } else {
                  // There is no definition for the command. Return the token itself, but with an
                  // added `invalid' property so that it is typeset in a red color later.
                  token.invalid = true;
                  return [token];
                }
              } else if (token.type == "character") {
                // The token is an active character. It has to be looked up in the last Scope.
                if (token.char in lastScope.defs.active) {
                  // The active character has an actual definition. Now determine if it's a
                  // primitive command or a macro.
                  let macro = lastScope.defs.active[token.char];
  
                  if (macro.proxy) {
                    macro = macro.original;
                  }
  
                  if (macro.type == "primitive") {
                    // It's a primitive command.
                    let queuedToks = macro.function.call(token, {
                      mouth: mouth,
                      tokens: lastScope.tokens,
                      toggles: prefixedToggles,
                      catOf: catOf,
                      scopes: scopes,
                      lastScope: scopes[scopes.length - 1],
                      openGroups: openGroups,
                      contexts: contexts,
                      lastContext: contexts[contexts.length - 1] || {},
                      Scope: Scope,
                      style: style
                    });
                    token.recognized = true;
                    return Array.isArray(queuedToks) ? queuedToks : [];
                  } else {
                    // It's a macro. Do the same thing as what was done above for replacing a macro.
                    token.recognized = true;
                    let macroExpandSym = Symbol();
                    mouth.saveState(macroExpandSym);
                    let params = [];
                    for (let i = 0, l = macro.parameters.length; i < l; i++) {
                      let tok = macro.parameters[i];
                      if (tok.cat == catcodes.PARAMETER) {
                        if (macro.parameters[i + 1] &&
                          macro.parameters[i + 1].cat != catcodes.PARAMETER) {
                          let nextIndex = macro.parameters.map(
                            token => token.cat == catcodes.PARAMETER
                          ).indexOf(true, i + 1);
                          let next = macro.parameters.slice(i + 1, ~nextIndex ? nextIndex : Infinity);
                          params.push([]);
                          let tokensParsed = 0;
                          while (true) {
                            let otherTok = mouth.eat("argument");
                            if (!otherTok) {
                              token.invalid = true;
                              mouth.loadState(macroExpandSym);
                              return [token];
                            }
                            if (otherTok.length == 1) {
                              let currentTok = otherTok;
                              let argAbsorbSym = Symbol();
                              let isDone = false;
                              mouth.saveState(argAbsorbSym);
                              for (let nextIndex = 0; nextIndex < next.length; nextIndex++) {
                                if (!currentTok ||
                                  (currentTok.length != 1 &&
                                    (next[nextIndex].cat != catcodes.OPEN ||
                                      nextIndex != next.length - 1)) ||
                                  currentTok[0].type != next[nextIndex].type ||
                                  currentTok[0].cat != next[nextIndex].cat ||
                                  currentTok[0].code != next[nextIndex].code ||
                                  currentTok[0].name != next[nextIndex].name) {
                                  break;
                                }
                                if (nextIndex == next.length - 1) {
                                  isDone = true;
                                  break;
                                }
                                currentTok = mouth.eat("argument");
                              }
                              mouth.loadState(argAbsorbSym);
                              if (isDone) {
                                mouth.revert();
                                break;
                              }
                            }
                            params[params.length - 1] = params[params.length - 1].concat(otherTok);
                            tokensParsed++;
                          }
                          if (tokensParsed == 1 &&
                            params[params.length - 1][0].cat == catcodes.OPEN &&
                            params[params.length - 1][params[params.length - 1].length - 1].cat ==
                            catcodes.CLOSE) {
                            params[params.length - 1].shift();
                            params[params.length - 1].pop();
                          }
                        } else {
                          let otherTok = mouth.eat("argument");
                          if (!otherTok) {
                            token.invalid = true;
                            mouth.loadState(macroExpandSym);
                            return [token];
                          }
                          if (otherTok.length > 2) {
                            otherTok.shift();
                            otherTok.pop();
                          }
                          params.push(otherTok);
                        }
                      } else {
                        let otherTok = mouth.eat();
                        if (!tok ||
                          !otherTok ||
                          tok.type != otherTok.type ||
                          tok.cat != otherTok.cat ||
                          tok.code != otherTok.code ||
                          tok.name != otherTok.name) {
                          token.invalid = true;
                          mouth.loadState(macroExpandSym);
                          return [token];
                        }
                      }
                    }
                    let replacement = [];
                    for (let i = 0, l = macro.replacement.length; i < l; i++) {
                      if (macro.replacement[i].cat == catcodes.PARAMETER) {
                        if (macro.replacement[i + 1].cat == catcodes.PARAMETER) {
                          replacement.push(macro.replacement[i + 1]);
                          i++;
                        } else {
                          let index = macro.replacement[i + 1].char - 1;
                          if (index > params.length) {
                            replacement = replacement.concat({
                              type: "character",
                              cat: catcodes.OTHER,
                              char: macro.replacement[i].char,
                              code: macros.replacement[i].code,
                              invalid: true
                            });
                          } else {
                            replacement = replacement.concat(params[index]);
                            i++;
                          }
                        }
                      } else {
                        let clone = {};
                        for (let key in macro.replacement[i]) {
                          clone[key] = macro.replacement[i][key];
                        }
                        replacement.push(clone);
                      }
                    }
                    return replacement;
                  }
                } else {
                  // There's no definition for the character. Return it by itself in an array with an
                  // added `invalid' property.
                  token.invalid = true;
                  return [token];
                }
              }
            } else {
              // The token isn't a command or active character; just return it by itself in an
              // array.
              return [token];
            }
          }
  
          // Gives each Mouth instance an expand method while still having the `expand` function be
          // hoisted and referable by just `expand` instead of `this.expand`.
          this.expand = expand;
        }
      }
  
      // The Scope class is used in the `scopes` array. Each new Scope object will clone the `data`
      // object, or its surrounding scope. All scopes inherit from `data`, either directly or indi-
      // rectly, and all changes made on a Scope are propagated to all nested Scopes.
      class Scope{
        constructor() {
          // Get the Scope to inherit from.
          let parent = scopes[scopes.length - 1] || data;
          this.parentScope = parent;
  
          // Make fresh objects to store the data in.
          this.defs = {
            primitive: {},
            macros: {},
            active: {}
          };
  
          this.registers = {
            count: {},
            dimen: {},
            skip: {},
            muskip: {},
            named: {}
          };
  
          this.cats = {};
          this.mathcodes = {};
          this.lc = {};
          this.uc = {};
          this.font = {};
  
          // Clone all the data from the parent.
          for (let key in parent.defs.primitive) {
            this.defs.primitive[key] = parent.defs.primitive[key];
          }
          for (let key in parent.defs.macros) {
            this.defs.macros[key] = parent.defs.macros[key];
          }
          for (let key in parent.defs.active) {
            this.defs.active[key] = parent.defs.active[key];
          }
          for (let key in parent.lc) {
            this.lc[key] = new IntegerReg(parent.lc[key]);
          }
          for (let key in parent.uc) {
            this.uc[key] = new IntegerReg(parent.uc[key]);
          }
          for (let key in parent.font) {
            this.font[key] = parent.font[key];
          }
          for (let key in parent.cats) {
            if (!isNaN(key)) {
              this.cats[key] = new IntegerReg(parent.cats[key]);
            }
          }
          for (let key in parent.mathcodes) {
            if (!isNaN(key)) {
              this.mathcodes[key] = new IntegerReg(parent.mathcodes[key]);
            }
          }
          for (let key in parent.registers.count) {
            this.registers.count[key] = new IntegerReg(parent.registers.count[key]);
          }
          for (let key in parent.registers.dimen) {
            this.registers.dimen[key] = new DimenReg(parent.registers.dimen[key]);
          }
          for (let key in parent.registers.skip) {
            this.registers.skip[key] = new GlueReg(parent.registers.skip[key]);
          }
          for (let key in parent.registers.muskip) {
            this.registers.muskip[key] = new MuGlueReg(parent.registers.muskip[key]);
          }
          for (let key in parent.registers.named) {
            let reg = parent.registers.named[key];
            let type = reg.type == "integer" ? "count" :
              reg.type == "dimension" ? "dimen" :
                reg.type == "glue" ? "skip" :
                  "muskip";
            let regs = Object.values(parent.registers[type]);
            if (regs.includes(reg)) {
              for (let number in parent.registers[type]) {
                if (parent.registers.named[key] === parent.registers[type][number]) {
                  this.registers.named[key] = this.registers[type][number];
                }
              }
            } else {
              this.registers.named[key] =
                new (reg.type == "integer" ? IntegerReg :
                  reg.type == "dimension" ? DimenReg :
                    reg.type == "glue" ? GlueReg :
                      MuGlueReg)(reg);
            }
          }
  
          // Tokens are added to each scope's list of tokens. When a scope is closed, its tokens are
          // added to the global list of tokens.
          this.tokens = [];
  
          // Add this Scope to the end of the `scopes` array.
          scopes.push(this);
        }
  
        // Once for every scope, there is allowed to be a command like \over. It splits the
        // scope into two (and creates a fraction), but again, only once per scope. This boolean keeps
        // track of if one has already been found for this scope.
        split = false;
      }
  
  
      // The `catOf` function returns the catcode of the given string's first character. The catcode
      // table of the last scope in the scope chain is used. This function is used a lot in
      // `Mouth.eat' to parse strings into tokens.
      function catOf(char) {
        if (!char) {
          return null;
        }
        char = char.codePointAt(0);
        return char in scopes[scopes.length - 1].cats ?
            scopes[scopes.length - 1].cats[char].value :
            catcodes.OTHER;
      }
  
      // This function helps in looking up what family a character would normally be a part of. For
      // example, "1" is a regular Ord character while "+" would be a Bin character. "=" would be a
      // Rel character, and so on.
      function mathCodeOf(char) {
        if (!char) {
          return null;
        }
        char = char.codePointAt(0);
        return char in scopes[scopes.length - 1].mathcodes ?
            scopes[scopes.length - 1].mathcodes[char].value :
            atomTypes.ORD;
      }
  
  
      // Everything up to this point has been functions and variables. Here is where the actual pars-
      // ing starts.
  
      let mouth = new Mouth();
      // New Scopes automatically get added to the `scopes` array.
      new Scope();
  
      // This variable keeps track of how many groups are open. Every time a new group is opened, the
      // opening token is added to the array. When a matching closing token is found, the opening to-
      // ken is removed. If all the tokens are parsed and there are still open groups, all the opening
      // tokens in the array are marked as invalid.
      let openGroups = [];
  
      while (true) {
        let token = mouth.eat();
  
        if (token === null) {
          // If the end of the string has been reached and the style is "standalone", it means we can
          // terminate the parser.
          if (style == "standalone") {
            break;
          }
          // If the style is not "standalone", it means we were expecting a math delimiter to end the
          // string of TeX, but didn't find one. Abort the entire process and return.
          else {
            return [[], texString, false];
          }
        }
  
        let lastContext = contexts[contexts.length - 1] || {};
        let lastScope = scopes[scopes.length - 1];
  
        if (token.type == "command" || token.type == "character" && token.cat == catcodes.ACTIVE) {
          if (lastContext.type == "mathchoice") {
            lastContext.failed();
          }
          let expansion = mouth.expand(token, mouth);
          mouth.queue.unshift.apply(mouth.queue, expansion);
          continue;
        }
  
        if (token.type == "character" && token.cat == catcodes.PARAMETER) {
          // Parameter tokens are only allowed in certain contexts. If they aren't in their intended
          // context, they are invalid. The expression below adds an invalid char acter token to the
          // mouth's queue so that it's parsed next. It will be added as a regular, invalid token.
          if (lastContext.type == "mathchoice") {
            lastContext.failed();
          }
  
          mouth.queue.unshift({
            type: "character",
            cat: catcodes.OTHER,
            char: token.char,
            code: token.code,
            invalid: true
          });
        } else if (token.type == "character" && token.cat == catcodes.MATHSHIFT) {
          // If a math shift token is found, it might be to terminate the TeX parser. If the style is
          // in display, then the next token should also be a math shift token.
          if (lastContext.type == "mathchoice") {
            lastContext.failed();
          }
  
          // If the style is in display mode, another math shift token should follow this one. Other-
          // wise this token is marked as invalid.
          if (style == "display") {
            // The next token should also be a math shift token. If it's not, the current math
            // shift token is invalid.
            let tempMouth = new Mouth(mouth.string, mouth.queue);
            let doBreak = false;
  
            while (true) {
              let next = tempMouth.eat();
  
              if (!next) break;
  
              if (next.type == "command" || next.type == "character" && next.cat == catcodes.ACTIVE) {
                let expansion = tempMouth.expand(next, tempMouth);
                tempMouth.queue.unshift.apply(tempMouth.queue, expansion);
                continue;
              } else if (next.type == "character" && next.cat == catcodes.MATHSHIFT) {
                doBreak = true;
                tempMouth.finalize();
                mouth.string = tempMouth.string;
                break;
              } else break;
            }
  
            if (!doBreak) {
              mouth.queue.unshift({
                type: "character",
                cat: catcodes.OTHER,
                char: token.char,
                code: token.code,
                invalid: true
              });
            } else {
              break;
            }
          }
          // If the style is inline, this token on its own is enough to terminate the entire process.
          else if (style == "inline") {
            break;
          }
          // If the style is "standalone", any math shift token at all is considered invalid since the
          // only way to terminate the process is to reach the end of the string.
          else {
            mouth.queue.unshift({
              type: "character",
              cat: catcodes.OTHER,
              char: token.char,
              code: token.code,
              invalid: true
            });
          }
        } else if (token.type == "character" && token.cat == catcodes.SUPERSCRIPT) {
          // A superscript character (usually ^) is used to modify the last atom. First the last atom
          // is found, even if the last token in the list is not an atom. Once that atom is found, it
          // has to be checked. If it already has a superscript attached to it, then the current sup-
          // erscript is considered invalid. Otherwise, the context is changed so that the next atom
          // to be parsed will be added on to the previous atom instead of being its own.
          if (lastContext.type == "mathchoice") {
            lastContext.failed();
          }
  
          // Keep track of the atom to add a superscript to.
          let atom = null;
          for (let i = lastScope.tokens.length - 1; i >= 0; i--) {
            if (lastScope.tokens[i].type == "atom" &&
                !lastScope.tokens[i].ignore) {
              atom = lastScope.tokens[i];
              break;
            }
          }
  
          // If no previous atom was found, then a new, empty one has to be made and added on to the
          // token list.
          if (!atom) {
            atom = {
              type: "atom",
              atomType: atomTypes.ORD,
              nucleus: null,
              superscript: null,
              subscript: null
            };
            lastScope.tokens.push(atom);
          }
  
          if (atom.superscript) {
            // The atom already has a superscript. The current superscript is treated as an in-
            // valid character.
            lastScope.tokens.push({
              type: "atom",
              atomType: atomTypes.ORD,
              nucleus: {
                type: "symbol",
                char: token.char,
                code: token.code,
                invalid: true
              },
              superscript: null,
              subscript: null
            });
          } else if (lastContext.type == "superscript" || lastContext.type == "subscript") {
            // If a superscript context is already open, then the current superscript token is
            // invalid.
            atom[lastContext] = [{
              type: "atom",
              atomType: atomTypes.ORD,
              nucleus: {
                type: "symbol",
                char: token.char,
                code: token.code,
                invalid: true
              },
              superscript: null,
              subscript: null
            }];
            contexts.pop();
          } else {
            // A temporary token is added to the list. If the end of the TeX is encountered after this
            // token (i.e. there was no token to superscript), the token is marked as invalid.
            let tempToken = {
              type: "atom",
              atomType: atomTypes.ORD,
              nucleus: {
                type: "symbol",
                char: token.char,
                code: token.code
              },
              superscript: null,
              subscript: null,
              ignore: true
            };
            lastScope.tokens.push(tempToken);
            contexts.push({
              toString: function() {return "superscript"},
              type: "superscript",
              token: tempToken
            });
          }
        } else if (token.type == "character" && token.cat == catcodes.SUBSCRIPT) {
          // Do the same thing as what was done for superscript atoms.
          if (lastContext.type == "mathchoice") {
            lastContext.failed();
          }
  
          let atom = null;
          for (let i = lastScope.tokens.length - 1; i >= 0; i--) {
            if (lastScope.tokens[i].type == "atom" && !lastScope.tokens[i].ignore) {
              atom = scopes.last().tokens[i];
              break;
            }
          }
          if (!atom) {
            atom = {
              type: "atom",
              atomType: atomTypes.ORD,
              nucleus: null,
              superscript: null,
              subscript: null
            };
            lastScope.tokens.push(atom);
          }
  
          if (atom.subscript) {
            lastScope.tokens.push({
              type: "atom",
              atomType: atomTypes.ORD,
              nucleus: {
                type: "symbol",
                char: token.char,
                code: token.code,
                invalid: true
              },
              superscript: null,
              subscript: null
            });
          } else if (lastContext.type == "superscript" || lastContext.type == "subscript") {
            atom[lastContext] = [{
              type: "atom",
              atomType: atomTypes.ORD,
              nucleus: {
                type: "symbol",
                char: token.char,
                code: token.code,
                invalid: true
              },
              superscript: null,
              subscript: null
            }];
            contexts.pop();
          } else {
            let tempToken = {
              type: "atom",
              atomType: atomTypes.ORD,
              nucleus: {
                type: "symbol",
                char: token.char,
                code: token.code
              },
              superscript: null,
              subscript: null,
              ignore: true
            };
            lastScope.tokens.push(tempToken);
            contexts.push({
              toString: function() {return "subscript"},
              type: "subscript",
              token: tempToken
            });
          }
        } else if (token.type == "character" && token.cat == catcodes.OPEN) {
          // A token was found that opens a new group and scope. Add a temporary token that can be
          // marked invalid if the group is never closed.
          let atom = {
            type: "atom",
            atomType: atomTypes.ORD,
            nucleus: {
              type: "symbol",
              char: token.char,
              code: token.code
            },
            superscript: null,
            subscript: null,
            ignore: true
          };
  
          openGroups.push(atom);
          contexts.push({
            toString: () => "scope",
            type: "scope"
          });
          new Scope();
          scopes[scopes.length - 1].tokens.push(atom);
        } else if (token.type == "character" && token.cat == catcodes.CLOSE) {
          // A token was found that closes groups and scopes. If there are no open groups, then it is
          // marked as invalid. If the last scope was opened via a \left, it is also marked as inval-
          // id.
          if (scopes.length == 1 ||
              !openGroups.length ||
              lastScope.delimited ||
              lastScope.semisimple ||
              lastScope.isHalign ||
              lastScope.isHalignCell ||
              lastContext != "scope") {
            // If the character is invalid, an invalid character token is created and passed to the
            // mouth so it can be treated like a regular character.
            mouth.queue.unshift({
              type: "character",
              cat: catcodes.OTHER,
              char: token.char,
              code: token.code,
              invalid: true
            });
          } else {
            openGroups.pop();
            contexts.pop();
            lastContext = contexts[contexts.length - 1] || {};
  
            // A scope is about to be closed. All its tokes need to be added to its parent's
            // list of tokens.
  
            let tokens;
            if (lastScope.isFrac) {
              tokens = [{
                type: "atom",
                atomType: atomTypes.INNER,
                nucleus: [{
                  type: "fraction",
                  numerator: lastScope.fracNumerator,
                  denominator: lastScope.tokens,
                  barWidth: lastScope.barWidth,
                  delims: [lastScope.fracLeftDelim, lastScope.fracRightDelim],
                  nullDelimiterSpace: new DimenReg(lastScope.registers.named.nulldelimiterspace)
                }],
                superscript: null,
                subscript: null
              }];
            } else {
              tokens = lastScope.tokens;
            }
  
            if (lastScope.root) {
              lastScope.root.invalid = true;
            }
  
            if (scopes[scopes.length - 2] && scopes[scopes.length - 2].noAligned) {
              scopes[scopes.length - 3].noAligns.push({
                type: "atom",
                atomType: atomTypes.ORD,
                nucleus: tokens,
                superscript: null,
                subscript: null
              });
              scopes.pop();
            } else if (lastContext.type == "superscript") {
              scopes.pop();
              lastScope = scopes[scopes.length - 1];
              for (let i = lastScope.tokens.length - 1; i >= 0; i--) {
                if (lastScope.tokens[i].type == "atom" && !lastScope.tokens[i].ignore) {
                  lastScope.tokens[i].superscript = tokens;
                  break;
                }
              }
              contexts.pop();
            } else if (lastContext.type == "subscript") {
              scopes.pop();
              lastScope = scopes[scopes.length - 1];
              for (let i = lastScope.tokens.length - 1; i >= 0; i--) {
                if (lastScope.tokens[i].type == "atom" && !lastScope.tokens[i].ignore) {
                  lastScope.tokens[i].subscript = tokens;
                  break;
                }
              }
              contexts.pop();
            } else {
              if (lastScope.isFrac) {
                scopes.pop();
                scopes[scopes.length - 1].tokens.push(tokens[0]);
              } else {
                scopes.pop();
                scopes[scopes.length - 1].tokens.push({
                  type: "atom",
                  atomType: atomTypes.ORD,
                  nucleus: tokens,
                  superscript: null,
                  subscript: null
                });
              }
  
              // If it was the fourth mathchoice group, the \mathchoice has succeeded and its
              // context needs to be closed.
              if (lastContext.type == "mathchoice" && ++lastContext.current == 4) {
                lastContext.succeeded();
              }
            }
          }
        } else if (token.type == "character" && token.cat == catcodes.ALIGN) {
          // Alignment characters are used in tables to separate cells in a row. Each cell inherits a
          // preamble where some tokens are added to the end of the cell's content. The tokens are
          // still unparsed though, so they need to be passed through this parser first. To do that,
          // all the tokens are added to the mouth, along with the current token. Then, after all the
          // tokens have been parsed and this token is found again, the cell is done parsing and
          // should move on to the next.
          if (lastContext.type == "mathchoice") {
            lastContext.failed();
          }
  
          // If an alignment token is found that isn't in the context of a table, and any preamble has
          // already been parsed (this is the second time the token was found), then the token is
          // marked as invalid. If this is the first time it was found, there has to be at least one
          // scope in the scope chain that corresponds to a table cell, even if that scope isn't nec-
          // essarily the last one in the scope chain.
          let cellScope = false;
          for (let i = scopes.length - 1; i >= 0; i--) {
            if (scopes[i].isHalignCell) {
              cellScope = scopes[i];
              break;
            }
          }
  
          if (!cellScope) {
            mouth.queue.unshift({
              type: "character",
              cat: catcodes.OTHER,
              char: token.char,
              code: token.code,
              invalid: true
            });
            continue;
          }
          let halignScope = cellScope.parentScope;
          let row = halignScope.cellData[halignScope.cellData.length - 1];
          if (row[row.length - 1].omit) {
            token.postPreamble = true;
          }
  
          if (token.postPreamble && !lastScope.isHalignCell || lastContext != "scope") {
            mouth.queue.unshift({
              type: "character",
              cat: catcodes.OTHER,
              char: token.char,
              code: token.code,
              invalid: true
            });
            continue;
          }
  
          // If this is the first time the token is found, the preamble tokens should be added to the
          // mouth first along with the current token. If the cell was marked as `omit` though, then
          // the preamble doesn't apply to it, so it's the same as if this is the second time the to-
          // ken was found.
          if (!token.postPreamble) {
            let column = -1;
            for (let i = 0, l = row.length; i < l; i++) {
              column += row[i].span;
            }
  
            // Here, the preamble's tokens are inserted into the mouth's queue and the loop continues
            // parsing. First, the right preamble cell has to be gotten. If the preamble is repeating
            // (specified with a double alignment token in the \halign), then the repeatable cells
            // have to be repeated until the current column's index is reached. If the preamble
            // doesn't repeat forever and it doesn't specify a cell for the current column, then the
            // alignment token is marked as invalid since there's too many cells already.
            let tokens;
            if (halignScope.preamble[column]) {
              // A regular preamble cell was found, no repeating necessary.
              tokens = halignScope.preamble[column][1];
            } else if (~halignScope.repeatPreambleAt) {
              // The preamble doesn't have a cell for the column, so it needs to repeated until one's
              // found.
  
              // First get the subarray that's the repeatable section of the preamble.
              let repeatable =
                  halignScope.preamble.slice(
                    halignScope.repeatPreambleAt,
                    halignScope.preamble.length
                  );
              // Get the cell in the subarray that holds the tokens needed.
              tokens = repeatable[(column - halignScope.repeatPreambleAt) % repeatable.length][1];
            } else {
              // There aren't enough cells in the preamble and it can't be repeated. Mark the
              // alignment character as invalid.
              mouth.queue.unshift({
                type: "character",
                cat: catcodes.OTHER,
                char: token.char,
                code: token.code,
                invalid: true
              });
              continue;
            }
  
            // Since this will be creating a new cell, which will also need a preamble, check that the
            // preamble is long enough for that too.
            if (!halignScope.preamble[++column] && !~halignScope.repeatPreambleAt) {
              mouth.queue.unshift({
                type: "character",
                cat: catcodes.OTHER,
                char: token.char,
                code: token.code,
                invalid: true
              });
              continue;
            }
  
            // The preamble tokens are cloned first so that they can be reused (certain tokens like
            // \left or \begingroup can only be used once, so using a clone each time ensures they can
            // be used indefinitely).
            let preambleToks = [];
            for (let i = 0, l = tokens.length; i < l; i++) {
              let tok = {};
              for (let key in tokens[i]) {
                tok[key] = tokens[i][key];
              }
              preambleToks.push(tok);
            }
            mouth.queue.unshift.apply(mouth.queue, preambleToks.concat(token));
            token.postPreamble = true;
            continue;
          }
  
          // At this point, the preamble should have been parsed if there was one. Now, the
          // cell is ready to be closed to move on to the next one.
  
          if (lastScope.root) {
            lastScope.root.invalid = true;
          }
  
          contexts.pop();
          lastContext = contexts[contexts.length - 1] || {};
          let tokens = lastScope.tokens;
          if (lastScope.isFrac) {
            row[row.length - 1].content.push({
              type: "atom",
              atomType: "inner",
              nucleus: [{
                type: "fraction",
                numerator: lastScope.fracNumerator,
                denominator: tokens,
                barWidth: lastScope.barWidth,
                delims: [lastScope.fracLeftDelim, lastScope.fracRightDelim],
                nullDelimiterSpace: new DimenReg(lastScope.registers.named.nulldelimiterspace)
              }],
              superscript: null,
              subscript: null
            });
            scopes.pop();
          } else {
            scopes.pop();
            row[row.length - 1].content = row[row.length - 1].content.concat(tokens);
          }
          lastScope = scopes[scopes.length - 1];
  
          let alignOmitSym = Symbol();
          mouth.saveState(alignOmitSym);
  
          // Now, add a new cell to the scope.
          row.push({
            type: "cell",
            content: [],
            omit: false,
            span: 1
          });
  
          // Check to see if \omit follows the alignment token. If it does, the preamble
          // won't be used for that cell.
          while (true) {
            let token = mouth.eat();
  
            if (!token) {
              mouth.loadState(alignOmitSym);
              break;
            } else if (token.type == "character" && token.cat != catcodes.ACTIVE) {
              mouth.loadState(alignOmitSym);
              break;
            } else if (token.type == "command" || token.type == "character" &&
                token.cat == catcodes.ACTIVE) {
              if (token.name in lastScope.registers.named) {
                mouth.loadState(alignOmitSym);
                break;
              }
  
              let macro = token.type == "command" ?
                  lastScope.defs.primitive[token.name] ||
                  lastScope.defs.macros[token.name] :
                  lastScope.defs.active[token.char];
  
              if (!macro) {
                mouth.loadState(alignOmitSym);
                break;
              }
  
              if (macro.proxy) {
                macro = macro.original
              }
  
              if (expandablePrimitives.includes(macro)) {
                let expansion = mouth.expand(token, mouth);
                if (expansion.length == 1 && expansion[0] === token && token.invalid) {
                  mouth.loadState(alignOmitSym);
                  break;
                }
                mouth.queue.unshift.apply(mouth.queue, expansion);
                continue;
              } else if (macro === data.defs.primitive.omit) {
                row[row.length - 1].omit = true;
                break;
              }
  
              if (macro.type == "primitive") {
                mouth.loadState(alignOmitSym);
                break;
              }
  
              let expansion = mouth.expand(token, mouth);
              if (expansion.length == 1 && expansion[0] ==- token && token.invalid) {
                mouth.loadState(alignOmitSym);
                break;
              }
              mouth.queue.unshift.apply(mouth.queue, expansion);
            }
          }
  
          // Open a new scope for the new cell.
          contexts.push({
            toString: () => "scope",
            type: "scope"
          });
          new Scope();
          scopes[scopes.length - 1].isHalignCell = true;
  
          // If the cell wasn't marked as `omit', the preamble for the new column needs to be
          // evaluated.
          if (!row[row.length - 1].omit) {
            let column = -1;
            for (let i = 0, l = row.length; i < l; i++) {
              column += row[i].span;
            }
            if (halignScope.preamble[column]) {
              tokens = halignScope.preamble[column][0];
            } else if (~halignScope.repeatPreambleAt) {
              let repeatable =
                  halignScope.preamble.slice(
                    halignScope.repeatPreambleAt,
                    halignScope.preamble.length
                  );
              tokens = repeatable[(column - halignScope.repeatPreambleAt) % repeatable.length][0];
            }
  
            // The tokens are cloned here too for the same reason they were closed in the pre-
            // amble to close the cell.
            let preambleToks = [];
            for (let i = 0, l = tokens.length; i < l; i++) {
              let token = {};
              for (let key in tokens[i]) {
                token[key] = tokens[i][key];
              }
              preambleToks.push(token);
            }
            mouth.queue.unshift.apply(mouth.queue, preambleToks);
          }
        } else if (token.type == "character") {
          // A regular character was found.
          if (lastContext.type == "mathchoice") {
            lastContext.failed();
          }
  
          let char = {
            type: "symbol",
            char: token.char,
            code: token.code,
            invalid: token.invalid
          };
  
          // The mathcode of the character is gotten first. If it's mathcode 8, then its active char-
          // acter definition is used instead (pretty much only for the apostrophe character).
          let mathcode = token.forcedMathCode + 1 ? token.forcedMathCode : mathCodeOf(char.char);
  
          // If a token is part of an invalid command name, it may be marked as `recognized`, which
          // indicated that the command exists, but wasn't used correctly. These types of atoms are
          // rendered in normal upright font, so they should have a mathcode of 0 (Ord) instead of 7
          // (Variable, rendered in italics).
          if (token.invalid && token.recognized) {
            mathcode = 0;
          }
  
          if (mathcode == catcodes.ACTIVE) {
            // A character with a mathcode of 8 is replaced with its active character definition.
            if (lastScope.defs.active[token.char]) {
              mouth.queue.unshift.apply(
                mouth.queue,
                (lastScope.defs.active[token.char].replacement ||
                  lastScope.defs.active[token.char].original.replacement).slice()
              );
              continue;
            } else {
              token.invalid = char.invalid = true;
              mathcode = 0;
            }
          }
  
          if (lastContext.type == "superscript") {
            // Superscripts and subscripts are kept best as entire atoms, even if they're just single
            // characters. That's because when they're being rendered, it's easier to just render an
            // entire atom than to shorten it into just one character.
            for (let i = lastScope.tokens.length - 1; i >= 0; i--) {
              if (lastScope.tokens[i].type == "atom" && !lastScope.tokens[i].ignore) {
                lastScope.tokens[i].superscript = [{
                  type: "atom",
                  atomType: mathcode,
                  nucleus: char,
                  superscript: null,
                  subscript: null
                }];
                break;
              }
            }
  
            contexts.pop();
          } else if (lastContext.type == "subscript") {
            // Do the same thing for subscripts.
            for (let i = lastScope.tokens.length - 1; i >= 0; i--) {
              if (lastScope.tokens[i].type == "atom" && !lastScope.tokens[i].ignore) {
                lastScope.tokens[i].subscript = [{
                  type: "atom",
                  atomType: mathcode,
                  nucleus: char,
                  superscript: null,
                  subscript: null
                }];
                break;
              }
            }
  
            contexts.pop();
          } else {
            // Add it as a regular atom.
            lastScope.tokens.push({
              type: "atom",
              atomType: mathcode,
              nucleus: char,
              superscript: null,
              subscript: null
            });
          }
        } else if (token.register) {
          // If there's a register token, it means the user referenced one using a command like \count
          // or \escapechar. It should be followed by as assignment.
          if (lastContext.type == "mathchoice") {
            lastContext.failed();
          }
  
          // First look for an equals sign. If one isn't found, then the token that was eaten is re-
          // turned.
  
          let regAssignment = Symbol();
          mouth.saveState(regAssignment);
          let optEquals = mouth.eat();
          if (optEquals && (optEquals.type != "character" || optEquals.char != "=" ||
              optEquals.cat != catcodes.OTHER)) {
            mouth.revert();
          }
  
          // Now, look for the new value for the register.
          if (token.type == "integer") {
            let integer = mouth.eat("integer");
  
            if (!integer) {
              mouth.loadState(regAssignment);
            } else {
              // First, a check is made to ensure the new value is within the register's allowed range
              // of values (for a normal count register, that's between [-9007199254740991,
              // 9007199254740991]. For a catcode register though, it's only between [0, 15].
              if (integer.value < token.min || token.max < integer.value) {
                mouth.loadState(regAssignment);
                continue;
              }
  
              // Now, the original token is saved.
              let oldTok = token;
              // Then, if \global is active, all the registers from the current scope up to the global
              // one are all changed to the new value. If \global is inactive, nothing happens.
              if (prefixedToggles.global && lastScope.registers.named.globaldefs.value >= 0 ||
                  lastScope.registers.named.globaldefs.value > 0) {
                while (token.parent) {
                  token = token.parent;
                  token.value = integer.value;
                }
              }
              // Now, the original token is changed. The reason the original token is changed after
              // all the global changes have been made is that if the current count register is refer-
              // ring to \globaldefs, then the \global has to be detected before it is changed. If the
              // original token was changed first, then the if block right after would only consider
              // its new value, not the value it was at when the definition was made. This only hap-
              // pens when changing integer registers because it's the only one affected by this prob-
              // lem. For other types of registers, the original token can be changed before or after
              // the if block and it wouldn't made a difference.
              oldTok.value = integer.value;
              prefixedToggles.global = false;
            }
          } else if (token.type == "dimension") {
            let dimen = mouth.eat("dimension");
  
            if (!dimen) {
              mouth.loadState(regAssignment);
            } else {
              token.sp.value = dimen.sp.value;
              token.em.value = dimen.em.value;
              if (prefixedToggles.global && lastScope.registers.named.globaldefs.value >= 0 ||
                  lastScope.registers.named.globaldefs.value > 0) {
                while (token.parent) {
                  token = token.parent;
                  token.sp.value = dimen.sp.value;
                  token.em.value = dimen.em.value;
                }
              }
              prefixedToggles.global = false;
            }
          } else if (token.type == "mu dimension") {
            let dimen = mouth.eat("mu dimension");
  
            if (!dimen) {
              mouth.loadState(regAssignment);
            } else {
              token.mu.value = dimen.mu.value;
              if (prefixedToggles.global && lastScope.registers.named.globaldefs.value >= 0 ||
                  lastScope.registers.named.globaldefs.value > 0) {
                while (token.parent) {
                  token = token.parent;
                  token.mu.value = integer.mu.value;
                }
              }
              prefixedToggles.global = false;
            }
          } else if (token.type == "glue") {
            let glue = mouth.eat("glue");
  
            if (!glue) {
              mouth.loadState(regAssignment);
            } else {
              token.start.sp.value = glue.start.sp.value;
              token.start.em.value = glue.start.em.value;
              if (glue.stretch.type == "infinite dimension") {
                token.stretch =
                    new InfDimen(glue.stretch.number.value, glue.stretch.magnitude.value);
              } else {
                token.stretch =
                    new DimenReg(glue.stretch.sp.value, glue.stretch.em.value);
              }
              if (glue.shrink.type == "infinite dimension") {
                token.shrink =
                    new InfDimen(glue.shrink.number.value, glue.shrink.magnitude.value);
              } else {
                token.shrink =
                    new DimenReg(glue.shrink.sp.value, glue.shrink.em.value);
              }
              if (prefixedToggles.global && lastScope.registers.named.globaldefs.value >= 0 ||
                  lastScope.registers.named.globaldefs.value > 0) {
                while (token.parent) {
                  token = token.parent;
                  token.start.sp.value = glue.start.sp.value;
                  token.start.em.value = glue.start.em.value;
                  if (glue.stretch.type == "infinite dimension") {
                    token.stretch =
                        new InfDimen(glue.stretch.number.value, glue.stretch.magnitude.value);
                  } else {
                    token.stretch =
                        new DimenReg(glue.stretch.sp.value, glue.stretch.em.value);
                  }
                  if (glue.shrink.type == "infinite dimension") {
                    token.shrink =
                        new InfDimen(glue.shrink.number.value, glue.shrink.magnitude.value);
                  } else {
                    token.shrink =
                        new DimenReg(glue.shrink.sp.value, glue.shrink.em.value);
                  }
                }
              }
              prefixedToggles.global = false;
            }
          } else if (token.type == "mu glue") {
            let glue = mouth.eat("mu glue");
  
            if (!glue) {
              mouth.loadState(regAssignment);
            } else {
              token.start.mu.value = glue.start.mu.value;
              if (glue.stretch.type == "infinite dimension") {
                token.stretch =
                    new InfDimen(glue.stretch.number.value, glue.stretch.magnitude.value);
              } else {
                token.stretch =
                    new MuDimenReg(glue.stretch.mu.value);
              }
              if (glue.shrink.type == "infinite dimension") {
                token.shrink =
                    new InfDimen(glue.shrink.number.value, glue.shrink.magnitude.value);
              } else {
                token.shrink =
                    new MuDimenReg(glue.shrink.mu.value);
              }
              if (prefixedToggles.global && lastScope.registers.named.globaldefs.value >= 0 ||
                  lastScope.registers.named.globaldefs.value > 0) {
                while (token.parent) {
                  token = token.parent;
                  token.start.mu.value = glue.start.mu.value;
                  if (glue.stretch.type == "infinite dimension") {
                    token.stretch =
                        new InfDimen(glue.stretch.number.value, glue.stretch.magnitude.value);
                  } else {
                    token.stretch =
                        new MuDimenReg(glue.stretch.mu.value);
                  }
                  if (glue.shrink.type == "infinite dimension") {
                    token.shrink =
                        new InfDimen(glue.shrink.number.value, glue.shrink.magnitude.value);
                  } else {
                    token.shrink =
                        new MuDimenReg(glue.shrink.mu.value);
                  }
                }
              }
              prefixedToggles.global = false;
            }
          }
        } else if (token.type == "ignored command") {
          lastScope.tokens.push(token.token);
          continue;
        }
  
        // At this point, any toggles should have been resolved. If there are any toggles still on
        // after a token was already parsed, then that toggle is invalid.
        for (let toggle in prefixedToggles) {
          if (prefixedToggles[toggle]) {
            prefixedToggles[toggle].invalid = true;
            prefixedToggles[toggle] = false;
          }
        }
      }
  
  
      // Now that the end of the TeX has been reached, an unclosed sub/superscript context means a
      // sub/superscript token wasn't found.
      let lastContext = contexts[contexts.length - 1] || {};
      if (lastContext == "superscript" ||
          lastContext == "subscript") {
        lastContext.token.invalid = true;
        lastContext.token.ignore = false;
      }
  
  
      // Now, all the unclosed scopes need to be closed so that they all collapse into one group of
      // tokens.
      while (scopes.length > 1) {
        contexts.pop();
        let lastContext = contexts[contexts.length - 1] || {};
        let lastScope = scopes[scopes.length - 1];
        let tokens = lastScope.tokens;
  
        if (lastScope.root) {
          lastScope.root.invalid = true;
        }
  
        if (lastContext.type == "superscript") {
          scopes.pop();
          lastScope = scopes[scopes.length - 1];
          for (let i = lastScope.tokens.length - 1; i >= 0; i--) {
            if (lastScope.tokens[i].type == "atom" && !lastScope.tokens[i].ignore) {
              lastScope.tokens[i].superscript = tokens;
              break;
            }
          }
          contexts.pop();
          lastContext = contexts[contexts.length - 1] || {};
        } else if (lastContext.type == "subscript") {
          scopes.pop();
          lastScope = scopes[scopes.length - 1];
          for (let i = lastScope.tokens.length - 1; i >= 0; i--) {
            if (lastScope.tokens[i].type == "atom" && !lastScope.tokens[i].ignore) {
              lastScope.tokens[i].subscript = tokens;
              break;
            }
          }
          contexts.pop();
          lastContext = contexts[contexts.length - 1] || {};
        } else {
          if (lastScope.isFrac) {
            scopes[scopes.length - 2].tokens.push({
              type: "atom",
              atomType: "inner",
              nucleus: [{
                type: "fraction",
                numerator: lastScope.fracNumerator,
                denominator: tokens,
                barWidth: lastScope.barWidth,
                delims: [lastScope.fracLeftDelim, lastScope.fracRightDelim],
                nullDelimiterSpace: new DimenReg(lastScope.registers.named.nulldelimiterspace)
              }],
              superscript: null,
              subscript: null
            });
            scopes.pop();
            lastScope = scopes[scopes.length - 1];
          } else {
            scopes.pop();
            lastScope = scopes[scopes.length - 1];
            lastScope.tokens.push({
              type: "atom",
              atomType: atomTypes.ORD,
              nucleus: tokens,
              superscript: null,
              subscript: null
            });
          }
        }
      }
  
      // If the global scope was a fraction, it should be collapsed into one.
      if (scopes[0].isFrac) {
        let tokens = scopes[0].tokens;
  
        scopes[0].tokens = [{
          type: "atom",
          atomType: atomTypes.INNER,
          nucleus: [{
            type: "fraction",
            numerator: scopes[0].fracNumerator,
            denominator: tokens,
            barWidth: scopes[0].barWidth,
            delims: [scopes[0].fracLeftDelim, scopes[0].fracRightDelim],
            nullDelimiterSpace: new DimenReg(scopes[0].registers.named.nulldelimiterspace)
          }],
          superscript: null,
          subscript: null
        }];
      }
  
      // Now, go back and mark any unclosed groups as invalid. That includes any opening characters
      // (like {) or \left commands.
      for (let i = 0, l = openGroups.length; i < l; i++) {
        openGroups[i].invalid = true;
      }
  
      // Now, any tokens marked with an `ignore' property need to be removed, unless they
      // were also marked as invalid.
      function removeIgnored(tokens) {
        for (let i = 0, l = tokens.length; i < l; i++) {
          if (tokens[i] && tokens[i].ignore && tokens[i].type == "command") {
            if (tokens[i].invalid) {
              let toks = (tokens[i].escapeChar + tokens[i].name).split("").map(element => ({
                type: "atom",
                atomType: tokens[i].recognized ? atomTypes.ORD : atomTypes.VARIABLE,
                nucleus: {
                  type: "symbol",
                  char: element,
                  code: element.codePointAt(0),
                  invalid: true
                },
                superscript: null,
                subscript: null
              }));
              tokens.splice(i, 1, {
                type: "atom",
                atomType: atomTypes.ORD,
                nucleus: toks,
                superscript: null,
                subscript: null
              });
            } else {
              tokens.splice(i, 1);
            }
            l = tokens.length;
            i--;
          } else if (tokens[i] && tokens[i].ignore && !tokens[i].invalid) {
            tokens.splice(i, 1);
            l = tokens.length;
            i--;
          } else if (tokens[i] && tokens[i].type == "fraction") {
            removeIgnored(tokens[i].numerator);
            removeIgnored(tokens[i].denominator);
          } else if (tokens[i] && tokens[i].type == "table") {
            removeIgnored(tokens[i].noAligns);
            for (let n = 0, j = tokens[i].cellData.length; n < j; n++) {
              for (let m = 0, k = tokens[i].cellData[n].length; m < k; m++) {
                removeIgnored(tokens[i].cellData[n][m].content);
              }
            }
          } else if (tokens[i] && tokens[i].type == "atom") {
            if (Array.isArray(tokens[i].nucleus)) {
              removeIgnored(tokens[i].nucleus);
            }
            if (Array.isArray(tokens[i].superscript)) {
              removeIgnored(tokens[i].superscript);
            }
            if (Array.isArray(tokens[i].subscript)) {
              removeIgnored(tokens[i].subscript);
            }
          } else if (tokens[i] && tokens[i].type == "mathchoice") {
            removeIgnored(tokens[i].groups);
          } else if (tokens[i] && tokens[i].type == "box") {
            removeIgnored([tokens[i].content]);
          } else if (tokens[i] && tokens[i].type == "family modifier" && tokens[i].value == "rad") {
            removeIgnored(tokens[i].index);
          }
        }
      }
      removeIgnored(scopes[0].tokens);
  
      // Math family tokens like \mathbin and \overline are resolved here.
      function resolveFamilies(tokens) {
        for (let i = 0, l = tokens.length; i < l; i++) {
          if (tokens[i] && tokens[i].type == "family modifier") {
            if (tokens[i + 1] && tokens[i + 1].type == "atom") {
              if (tokens[i].value == "phantom") {
                tokens.splice(i, 1);
                tokens[i].phantom = true;
              } else {
                tokens.splice(i, 2, {
                  type: "atom",
                  atomType: tokens[i].value,
                  nucleus: [tokens[i + 1]],
                  superscript: tokens[i + 1].superscript,
                  subscript: tokens[i + 1].subscript,
                  invalid: tokens[i + 1].invalid,
                  index: tokens[i].index,
                  phantom: tokens[i + 1].phantom
                });
                tokens[i].nucleus[0].superscript = null;
                tokens[i].nucleus[0].subscript = null;
                i--;
              }
              l = tokens.length;
            } else {
              let toks =
                  (tokens[i].token.type == "command" ?
                    tokens[i].token.escapeChar + tokens[i].token.name :
                    tokens[i].token.char
                  ).split("").map(element => ({
                    type: "atom",
                    atomType: atomTypes.ORD,
                    nucleus: {
                      type: "symbol",
                      char: element,
                      code: element.codePointAt(0),
                      invalid: true
                    },
                    superscript: null,
                    subscript: null
                  }));
              tokens[i] = {
                type: "atom",
                atomType: atomTypes.ORD,
                nucleus: toks,
                superscript: null,
                subscript: null
              };
            }
          } else if (tokens[i] && tokens[i].type == "fraction") {
            resolveFamilies(tokens[i].numerator);
            resolveFamilies(tokens[i].denominator);
          } else if (tokens[i] && tokens[i].type == "table") {
            resolveFamilies(tokens[i].noAligns);
            for (let n = 0, j = tokens[i].cellData.length; n < j; n++) {
              for (let m = 0, k = tokens[i].cellData[n].length; m < k; m++) {
                resolveFamilies(tokens[i].cellData[n][m].content);
              }
            }
          } else if (tokens[i] && tokens[i].type == "atom") {
            if (Array.isArray(tokens[i].nucleus)) {
              resolveFamilies(tokens[i].nucleus);
            }
            if (Array.isArray(tokens[i].superscript)) {
              resolveFamilies(tokens[i].superscript);
            }
            if (Array.isArray(tokens[i].subscript)) {
              resolveFamilies(tokens[i].subscript);
            }
            if (Array.isArray(tokens[i].index)) {
              resolveFamilies(tokens[i].index);
            }
          } else if (tokens[i] && tokens[i].type == "mathchoice") {
            resolveFamilies(tokens[i].groups);
          } else if (tokens[i] && tokens[i].type == "box") {
            resolveFamilies([tokens[i].content]);
          }
        }
      }
      resolveFamilies(scopes[0].tokens);
  
      // Now, "accent modifier" tokens are looked for. If the next token is an atom, the
      // entire nucleus is wrapped into an Acc atom and the "accent modifier" token is
      // removed. If the next token is NOT an atom, the "accent modifier" token is re-
      // placed with an invalid command atom. The reason this comes after family modifi-
      // ers is because it allows for constructions like "\acute\lim", which expands to
      // "\accent"B4 \mathop{ ... }". The \mathop is evaluated first and is treated all
      // as one atom by the \accent instead of treating it as a family modifier followed
      // by an atom.
      function resolveAccents(tokens) {
        for (let i = 0, l = tokens.length; i < l; i++) {
          if (tokens[i] && tokens[i].type == "accent modifier") {
            if (tokens[i + 1] && tokens[i + 1].type == "atom") {
              tokens.splice(i, 2, {
                type: "atom",
                atomType: atomTypes.ACC,
                nucleus: [tokens[i + 1]],
                superscript: tokens[i + 1].superscript,
                subscript: tokens[i + 1].subscript,
                accChar: tokens[i].char,
                accCode: tokens[i].code,
                invalid: tokens[i + 1].invalid,
                phantom: tokens[i + 1].phantom
              });
              tokens[i].nucleus[0].superscript = null;
              tokens[i].nucleus[0].subscript = null;
              l = tokens.length;
              i--;
            } else {
              let toks = 
                  (tokens[i].token.type == "command" ?
                    tokens[i].token.escapeChar + tokens[i].token.name :
                    tokens[i].token.char
                  ).split("").map(element => ({
                    type: "atom",
                    atomType: atomTypes.ORD,
                    nucleus: {
                      type: "symbol",
                      char: element,
                      code: element.codePointAt(0),
                      invalid: true
                    },
                    superscript: null,
                    subscript: null
                  }));
              tokens[i] = {
                type: "atom",
                atomType: atomTypes.ORD,
                nucleus: toks,
                superscript: null,
                subscript: null
              };
            }
          } else if (tokens[i] && tokens[i].type == "fraction") {
            resolveAccents(tokens[i].numerator);
            resolveAccents(tokens[i].denominator);
          } else if (tokens[i] && tokens[i].type == "table") {
            resolveAccents(tokens[i].noAligns);
            for (let n = 0, j = tokens[i].cellData.length; n < j; n++) {
              for (let m = 0, k = tokens[i].cellData[n].length; m < k; m++) {
                resolveAccents(tokens[i].cellData[n][m].content);
              }
            }
          } else if (tokens[i] && tokens[i].type == "atom") {
            if (Array.isArray(tokens[i].nucleus)) {
              resolveAccents(tokens[i].nucleus);
            }
            if (Array.isArray(tokens[i].superscript)) {
              resolveAccents(tokens[i].superscript);
            }
            if (Array.isArray(tokens[i].subscript)) {
              resolveAccents(tokens[i].subscript);
            }
            if (Array.isArray(tokens[i].index)) {
              resolveAccents(tokens[i].index);
            }
          } else if (tokens[i] && tokens[i].type == "mathchoice") {
            resolveAccents(tokens[i].groups);
          } else if (tokens[i] && tokens[i].type == "box") {
            resolveAccents([tokens[i].content]);
          }
        }
      }
      resolveAccents(scopes[0].tokens);
  
      // Limit modifiers (\displaylimits, \limits, \nolimits) are resolved here.
      function resolveLimits(tokens) {
        for (let i = 0, l = tokens.length; i < l; i++) {
          if (tokens[i] && tokens[i].type == "limit modifier") {
            if (tokens[i - 1] && tokens[i - 1].type == "atom" &&
                tokens[i - 1].atomType == atomTypes.OP) {
              tokens[i - 1].limits = tokens[i].value;
              tokens.splice(i, 1);
              l = tokens.length;
              i--;
            } else {
              let toks =
                  (tokens[i].token.type == "command" ?
                    tokens[i].token.escapeChar + tokens[i].token.name :
                    tokens[i].token.char
                  ).split("").map(element => ({
                    type: "atom",
                    atomType: atomTypes.ORD,
                    nucleus: {
                      type: "symbol",
                      char: element,
                      code: element.codePointAt(0),
                      invalid: true
                    },
                    superscript: null,
                    subscript: null
                  }));
              tokens[i] = {
                type: "atom",
                atomType: atomTypes.ORD,
                nucleus: toks,
                superscript: null,
                subscript: null
              };
            }
          } else if (tokens[i] && tokens[i].type == "fraction") {
            resolveLimits(tokens[i].numerator);
            resolveLimits(tokens[i].denominator);
          } else if (tokens[i] && tokens[i].type == "table") {
            resolveLimits(tokens[i].noAligns);
            for (let n = 0, j = tokens[i].cellData.length; n < j; n++) {
              for (let m = 0, k = tokens[i].cellData[n].length; m < k; m++) {
                resolveLimits(tokens[i].cellData[n][m].content);
              }
            }
          } else if (tokens[i] && tokens[i].type == "atom") {
            if (tokens[i].atomType == atomTypes.OP) {
              tokens[i].limits = "display";
            }
            if (Array.isArray(tokens[i].nucleus)) {
              resolveLimits(tokens[i].nucleus);
            }
            if (Array.isArray(tokens[i].superscript)) {
              resolveLimits(tokens[i].superscript);
            }
            if (Array.isArray(tokens[i].subscript)) {
              resolveLimits(tokens[i].subscript);
            }
            if (Array.isArray(tokens[i].index)) {
              resolveLimits(tokens[i].index);
            }
          } else if (tokens[i] && tokens[i].type == "mathchoice") {
            resolveLimits(tokens[i].groups);
          } else if (tokens[i] && tokens[i].type == "box") {
            resolveLimits([tokens[i].content]);
          }
        }
      }
      resolveLimits(scopes[0].tokens);
  
      // Any \hbox and \vbox commands need to take affect now. If there was a \hbox or
      // \vbox, the token after it will be placed inside a box with the specified height
      // or width
      function resolveBoxes(tokens) {
        for (let i = 0, l = tokens.length; i < l; i++) {
          if (tokens[i] && tokens[i].type == "box wrapper") {
            if (tokens[i + 1] && tokens[i + 1].type == "atom") {
              tokens.splice(i, 2, {
                type: "box",
                boxType: tokens[i].value,
                to: tokens[i].to,
                spread: tokens[i].spread,
                content: tokens[i + 1],
                superscript: null,
                subscript: null
              });
              l = tokens.length;
              i--;
            } else {
              let toks =
                (tokens[i].token.type == "command" ?
                  tokens[i].token.escapeChar + tokens[i].token.name :
                  tokens[i].token.char
                ).split("").map(element => ({
                  type: "atom",
                  atomType: atomTypes.ORD,
                  nucleus: {
                    type: "symbol",
                    char: element,
                    code: element.codePointAt(0),
                    invalid: true
                  },
                  superscript: null,
                  subscript: null
                }));
              tokens[i] = {
                type: "atom",
                atomType: atomTypes.ORD,
                nucleus: toks,
                superscript: null,
                subscript: null
              };
            }
          } else if (tokens[i] && tokens[i].type == "fraction") {
            resolveBoxes(tokens[i].numerator);
            resolveBoxes(tokens[i].denominator);
          } else if (tokens[i] && tokens[i].type == "table") {
            resolveBoxes(tokens[i].noAligns);
            for (let n = 0, j = tokens[i].cellData.length; n < j; n++) {
              for (let m = 0, k = tokens[i].cellData[n].length; m < k; m++) {
                resolveBoxes(tokens[i].cellData[n][m].content);
              }
            }
          } else if (tokens[i] && tokens[i].type == "atom") {
            if (Array.isArray(tokens[i].nucleus)) {
              resolveBoxes(tokens[i].nucleus);
            }
            if (Array.isArray(tokens[i].superscript)) {
              resolveBoxes(tokens[i].superscript);
            }
            if (Array.isArray(tokens[i].subscript)) {
              resolveBoxes(tokens[i].subscript);
            }
            if (Array.isArray(tokens[i].index)) {
              resolveBoxes(tokens[i].index);
            }
          } else if (tokens[i] && tokens[i].type == "mathchoice") {
            resolveBoxes(tokens[i].groups);
          } else if (tokens[i] && tokens[i].type == "box") {
            resolveBoxes([tokens[i].content]);
          }
        }
      }
      resolveBoxes(scopes[0].tokens);
  
      // Now, to help with later processing and to prevent unnecessary nesting, each atom so far is
      // iterated over. If its nucleus is a single atom with no sub/superscript (i.e. it was produced
      // by something like "{{atom}}"), then the nucleus is promoted up to the parent atom's nucleus.
      // This only applies to atoms whose types are considered unimportant, like Ord, Rel, Op, etc. If
      // an Acc atom though, for example, is found, it stays as an Acc atom so that it doesn't lose
      // its accent. Op atoms are still considered special enough to not be removed if their \limits
      // property is not false.
      function collapseAtoms(tokens) {
        for (let i = 0, l = tokens.length; i < l; i++) {
          if (tokens[i] && tokens[i].type == "atom") {
            if (Array.isArray(tokens[i].nucleus)) {
              collapseAtoms(tokens[i].nucleus);
            }
            if (Array.isArray(tokens[i].superscript)) {
              collapseAtoms(tokens[i].superscript);
            }
            if (Array.isArray(tokens[i].subscript)) {
              collapseAtoms(tokens[i].subscript);
            }
            if (Array.isArray(tokens[i].index)) {
              collapseAtoms(tokens[i].index);
            }
  
            if (Array.isArray(tokens[i].nucleus) && tokens[i].nucleus.length == 1 &&
                !tokens[i].nucleus[0].delimited) {
              if ([
                    atomTypes.ORD,
                    atomTypes.BIN,
                    atomTypes.REL,
                    atomTypes.OPEN,
                    atomTypes.CLOSE,
                    atomTypes.PUNCT,
                    atomTypes.INNER
                  ].includes(tokens[i].nucleus[0].atomType) && ![
                    atomTypes.OVER,
                    atomTypes.UNDER,
                    atomTypes.RAD
                  ].includes(tokens[i].atomType)) {
                if (!tokens[i].nucleus[0].superscript && !tokens[i].nucleus[0].subscript) {
                  tokens[i].phantom = tokens[i].phantom || tokens[i].nucleus[0].phantom;
                  tokens[i].nucleus = tokens[i].nucleus[0].nucleus;
                  i--;
                  continue;
                } else if (!tokens[i].superscript && !tokens[i].subscript) {
                  tokens[i].phantom = tokens[i].phantom || tokens[i].nucleus[0].phantom;
                  tokens[i].superscript = tokens[i].nucleus[0].superscript;
                  tokens[i].subscript = tokens[i].nucleus[0].subscript;
                  tokens[i].nucleus = tokens[i].nucleus[0].nucleus;
                  i--;
                  continue;
                }
              } else if (tokens[i].nucleus[0].atomType == atomTypes.VARIABLE &&
                  tokens[i].atomType == atomTypes.ORD) {
                if (!tokens[i].nucleus[0].superscript && !tokens[i].nucleus[0].subscript) {
                  tokens[i].phantom = tokens[i].phantom || tokens[i].nucleus[0].phantom;
                  tokens[i].nucleus = tokens[i].nucleus[0].nucleus;
                  tokens[i].atomType = atomTypes.VARIABLE;
                  i--;
                  continue;
                } else if (!tokens[i].superscript && !tokens[i].subscript) {
                  tokens[i].phantom = tokens[i].phantom || tokens[i].nucleus[0].phantom;
                  tokens[i].superscript = tokens[i].nucleus[0].superscript;
                  tokens[i].subscript = tokens[i].nucleus[0].subscript;
                  tokens[i].nucleus = tokens[i].nucleus[0].nucleus;
                  tokens[i].atomType = atomTypes.VARIABLE;
                  i--;
                  continue;
                }
              } else if (tokens[i].nucleus[0].atomType != atomTypes.VARIABLE && [
                    atomTypes.OVER,
                    atomTypes.UNDER,
                    atomTypes.RAD,
                    atomTypes.ACC
                  ].includes(tokens[i].atomType)) {
                if (!tokens[i].nucleus[0].superscript && !tokens[i].nucleus[0].subscript) {
                  tokens[i].phantom = tokens[i].phantom || tokens[i].nucleus[0].phantom
                  tokens[i].nucleus = tokens[i].nucleus[0].nucleus;
                }
              }
            }
          } else if (tokens[i] && tokens[i].type == "fraction") {
            if (tokens[i].numerator && Array.isArray(tokens[i].numerator) &&
                tokens[i].numerator.length == 1 && !tokens[i].numerator.subscript &&
                !tokens[i].numerator.superscript && Array.isArray(tokens[i].numerator[0].nucleus)) {
              tokens[i].numerator = tokens[i].numerator[0].nucleus;
            }
            if (tokens[i].denominator && Array.isArray(tokens[i].denominator) &&
              tokens[i].denominator.length == 1 && !tokens[i].denominator.subscript &&
              !tokens[i].denominator.superscript && Array.isArray(tokens[i].denominator[0].nucleus)) {
              tokens[i].denominator = tokens[i].denominator[0].nucleus;
            }
  
            collapseAtoms(tokens[i].numerator);
            collapseAtoms(tokens[i].denominator);
          } else if (tokens[i] && tokens[i].type == "table") {
            collapseAtoms(tokens[i].noAligns);
            for (let n = 0, j = tokens[i].cellData.length; n < j; n++) {
              for (let m = 0, k = tokens[i].cellData[n].length; m < k; m++) {
                collapseAtoms(tokens[i].cellData[n][m].content);
              }
            }
          } else if (tokens[i] && tokens[i].type == "mathchoice") {
            collapseAtoms(tokens[i].groups);
          } else if (tokens[i] && tokens[i].type == "box") {
            collapseAtoms(tokens[i].content.nucleus);
          }
        }
      }
      collapseAtoms(scopes[0].tokens);
  
      mouth.finalize();
  
      // Returning the scope instead of the tokens is used for `fontTeX.global`.
      if (returnScope && arguments[2]) {
        return scopes[0];
      }
  
      return [scopes[0].tokens, string, true];
    }
  
  
    // This function accepts a string of TeX without delimiters (i.e. the entire string is parsed as
    // TeX). Any assignments (like \def, \let, \catcode, \mathchardef, etc.) in the immediate scope of
    // the TeX is made global. Any tokens generated from the TeX are discarded. The purpose of this
    // function is for declaring macros (or registers, catcodes, etc.) that will be used throughout
    // the entire page. FontTeX starts off with just its primitives and builtin registers, but some
    // additional macros like \frac and \int are defined for the user using \def using this function
    // to make those definitions global. This function is the equivalent of adding \global in front of
    // every assignment, but only on the outer scope (scopes inside delimiers like { ... } still re-
    // main local and won't affect the global scope).
    fontTeX.global = function global(texString) {
      let scope = tokenize(
        texString,
        /* style       = */"standalone",
        /* returnScope = */true
      );
      
      for (let key in scope.defs.macros) {
        data.defs.macros[key] = scope.defs.macros[key];
      }
      for (let key in scope.defs.active) {
        data.defs.active[key] = scope.defs.active[key];
      }
      let doneRegs = [];
      for (let key in scope.registers.count) {
        let reg = new IntegerReg(scope.registers.count[key]);
        data.registers.count[key] = reg;
        doneRegs.push(reg);
      }
      for (let key in scope.registers.dimen) {
        let reg = new DimenReg(scope.registers.dimen[key]);
        data.registers.dimen[key] = reg;
        doneRegs.push(reg);
      }
      for (let key in scope.registers.skip) {
        let reg = new GlueReg(scope.registers.skip[key]);
        data.registers.skip[key] = reg;
        doneRegs.push(reg);
      }
      for (let key in scope.registers.muskip) {
        let reg = new MuGlueReg(scope.registers.muskip[key]);
        data.registers.muskip[key] = reg;
        doneRegs.push(reg);
      }
      for (let key in scope.registers.named) {
        if (doneRegs.includes(scope.registers.named[key])) {
          data.registers.named[key] = scope.registers.named[key];
          continue;
        }
        if (scope.registers.named[key].type == "integer") {
          data.registers.named[key] = new IntegerReg(scope.registers.named[key]);
        } else if (scope.registers.named[key].type == "dimension") {
          data.registers.named[key] = new DimenReg(scope.registers.named[key]);
        } else if (scope.registers.named[key].type == "mu dimension") {
          data.registers.named[key] = new MuDimenReg(scope.registers.named[key]);
        } else if (scope.registers.named[key].type == "glue") {
          data.registers.named[key] = new GlueReg(scope.registers.named[key]);
        } else if (scope.registers.named[key].type == "mu glue") {
          data.registers.named[key] = new MuGlueReg(scope.registers.named[key]);
        }
      }
      for (let key in scope.cats) {
        data.cats[key].value = scope.cats[key].value;
      }
      for (let key in scope.mathcodes) {
        data.mathcodes[key].value = scope.mathcodes[key].value;
      }
      for (let key in scope.uc) {
        data.uc[key].value = scope.uc[key].value;
      }
      for (let key in scope.lc) {
        data.lc[key].value = scope.lc[key].value;
      }
    }
  
  
    // This function turns a list of tokens from `tokenize` into an HTML element. The element can be
    // added to the document to show the TeX.
    function genHTML(container, tokens, contStyle, cssDeclaration) {
      // The full set of instructions as to how TeX creates a horizontal box from a list of tokens
      // starts on page 441 (all of Appendix G) of the TeXbook. This function follows a similar set of
      // instructions. Instead of the horizontal boxes that TeX uses, this uses flex-box <div>s.
  
      // Each list of tokens is parsed using the function below. The function is called
      // recursively for lists found within lists.
  
      // First, one central element is created that all other elements will be children of. This is
      // the element that gets returned.
      let div = document.createElement("div");
      // Its display style is also set to match whether it's an inline or a displayed equation.
      if (contStyle == "display") {
        div.style.textAlign = "center";
      } else {
        div.style.display = "inline-block";
      }
  
      // The font-size of the container is gotten in px for future reference.
      let fontSize = parseFloat(cssDeclaration.fontSize);
  
      // The font-family is also saved.
      let family = cssDeclaration.fontFamily;
  
      // Turn the tokens into an element (this is where all the magic happens).
      newBox(
        /* tokens  = */tokens,
        /* style   = */contStyle,
        /* cramped = */false,
        /* font    = */"nm",
        /* parent  = */div
      );
  
      // If the box that was created is actually empty, return a blank TextNode instead of the orig-
      // inal <div>.
      if (div.firstElementChild.empty && div.children.length == 1) {
        div = document.createTextNode("");
      }
  
      // A helper function recursively iterates over an element's children, adding flex-wrap: nowrap;
      // to every descendant element.
      function noWrap(elem) {
        for (let child of elem.children) {
          noWrap(child);
        }
        if (elem.style.flexWrap) {
          elem.style.flexWrap = "nowrap";
        }
        return elem;
      }
  
      // A "box" is actually a flex-box <div> element. Being a flex box allows for spacing between el-
      // elements to grow and shrink the way they do in TeX to take up the whole line. Each flex-box
      // is composed of smaller flex-boxes that contain part of a line of text. Between each child
      // flex-box, a line break is allowed, but not inside each child flex-box. A new child flex-box
      // is created when a Rel or Bin atom is encountered so that a line only ends before characters
      // like "=" or "+".
      function newBox(tokens, style, cramped, font, parent) {
        // Prevent changing the original token array by making a clone.
        tokens = tokens.slice();
  
        // If the tokens are empty (like when a {} is encountered), a single empty <div> is placed in
        // the parent.
        if (!tokens.length) {
          let empty = document.createElement("div");
          empty.style.display = "inline-flex";
          empty.displayedStyle = style;
          empty.crampedStyle = cramped;
          empty.renderedDepth = 0;
          empty.renderedHeight = 0;
          parent.renderedHeight = parent.renderedHeight || 0;
          parent.renderedDepth = parent.renderedDepth || 0;
          parent.baseline = fontDimen.baselineHeightOf(family);
          parent.baselineOffset = 0;
          parent.appendChild(empty);
          empty.empty = true;
          return;
        }
  
        // When a new box is made, the last character of the box is returned. If an italic correction
        // happens after this box, it'll know which character to correct.
        let lastChar = null;
  
        // This is the parent flex-box. It's allowed to wrap its child flex-boxes.
        let flex = document.createElement("div");
        flex.style.display = "inline-flex";
        flex.style.flexWrap = "wrap";
        flex.style.alignItems = "baseline";
        flex.displayedStyle = style;
        flex.crampedStyle = cramped;
        flex.style.justifyContent = contStyle == "display" ? "center" : "initial";
        // Start the list of child flex-boxes.
        let childFlexes = [document.createElement("div")];
  
        // These child flex-boxes do not wrap.
        childFlexes[0].style.display = "inline-flex";
        childFlexes[0].style.flexWrap = "nowrap";
        childFlexes[0].style.alignItems = "baseline";
  
        // `items` holds all the elements that will be placed in child flex-boxes. `atoms` is similar
        // except that only actual atom elements are added to its array. It helps when trying to get
        // the last atom without having to iterate over `items` in reverse to get the last one.
        let items = [];
        let atoms = [];
  
        // Vertical glues and kerns let text be offset by a dimension. After a vertical glue/kern,
        // every token after it up to the end of the box is also shifted by the same amount. To keep
        // track of that vertical offset, `verticalOffset` is updated to hold that amount.
        let verticalOffset = 0;
  
        // Iterate over the tokens and turn them into HTML elements. The `items` and `atoms` lists are
        // populated here.
        for (let i = 0; i < tokens.length; i++) {
          let token = tokens[i];
          let next = tokens[i + 1] || {};
          let previous = tokens[i - 1] || {};
  
          // Glues and kerns need to be changed.
          if (["glue", "kern", "vglue", "vkern"].includes(token.type)) {
            if (token.italicCorrection) {
              token.italicCorrection = lastChar || "";
            }
  
            // If this is a glue and it's nonscript attribute is true (from a \nonscript command),
            // then the following glue should only appear in a non-script context (\displaystyle or
            // \textstyle).
            if (token.type == "glue" && token.isNonScript &&
                (style == "script" || style == "scriptscript") && [
                  "glue",
                  "vglue",
                  "kern",
                  "vkern"
                ].includes(next.type)) {
              tokens.splice(i + 1, 1);
              continue;
            }
            // A mu glue needs to convert its math units into em units.
            else if (token.type == "glue" && token.glue.type == "mu glue") {
              token.glue = new GlueReg(
                new DimenReg(0, token.glue.start.mu.value / 18),
                token.glue.stretch.type == "infinite dimension" ?
                 token.glue.stretch :
                 new DimenReg(0, Math.floor(token.glue.stretch.mu.value / 18)),
                token.glue.shrink.type == "infinite dimension" ?
                  token.glue.shrink :
                  new DimenReg(0, ~~(token.glue.shrink.mu.value / 18))
              );
            }
            // Convert mu kerns into regular kerns.
            else if (token.type == "kern" && token.dimen.type == "mu dimension") {
              token.dimen = new DimenReg(0, Math.floor(token.dimen.mu.value / 18));
            }
            // Since vertical glues don't really support stretching here, they're just converted di-
            // rectly into vertical kerns.
            else if (token.type == "vglue") {
              token.type = "vkern";
              token.dimen = token.glue.start;
              delete token.glue;
            }
  
            items.push(token);
            continue;
          }
  
          // Font modifiers only change the style of the font but don't contribute any HTML tokens.
          if (token.type == "font modifier") {
            if ([
              "displaystyle",
              "textstyle",
              "scriptstyle",
              "scriptscriptstyle"
            ].includes(token.value)) {
              style = token.value.substring(0, token.value.length - 5);
            } else {
              font = token.value;
            }
            continue;
          }
  
          // Mathchoices only insert the group that corresponds to the current math style.
          if (token.type == "mathchoice") {
            let atom = token.groups[["display", "text", "script", "scriptscript"].indexOf(style)];
  
            // Babel seems to break this part of the code if you use a spread "..." operator, so I
            // kept it as .apply instead.
            tokens.splice.apply(
              tokens,
              [i + 1, 0].concat(atom.nucleus.type == "symbol" ? [atom] : atom.nucleus)
            );
            continue;
          }
  
          // Convert Bin atoms to Ord atoms if they are preceded by an incompatible atom, or if they
          // are the first atom in the list.
          if (token.type == "atom" && token.atomType == atomTypes.BIN && (!atoms.length || [
              atomTypes.OP,
              atomTypes.BIN,
              atomTypes.REL,
              atomTypes.OPEN,
              atomTypes.PUNCT
            ].includes(atoms[atoms.length - 1].atomType))) {
            token.atomType = atomTypes.ORD;
            // Don't `continue` since this atom still needs to be converted to HTML.
          }
  
          // If the current atom is preceded by a Bin atom and forms an incompatible pair, convert the
          // last tome to Ord instead.
          if (token.type == "atom" && atoms.length && (
              token.atomType == atomTypes.REL ||
              token.atomType == atomTypes.CLOSE ||
              token.atomType == atomTypes.PUNCT) &&
              atoms[atoms.length - 1].atomType == atomTypes.BIN) {
            atoms[atoms.length - 1].atomType = atomTypes.ORD
            // Don't `continue` since this atom still needs to be converted to HTML.
          }
  
          // If the atom is an Op atom and its limits are set to "display", change it to true/false
          // depending on if the mat style is actually in display style.
          if (token.type == "atom" && token.atomType == atomTypes.OP && token.limits == "display") {
            token.limits = style == "display";
          }
  
          // Render fraction atoms.
          if (token.type == "fraction") {
            // This checks if the token is a fraction item. In plain TeX, there's a bunch of math that
            // goes into creating fractions so that the numerator and denominator look properly
            // placed. It relies on a lot of font parameters, which are only available from METAFONT's
            // fonts. HTML fonts on the other hand, don't have any parameters (some of them are fig-
            // ured out by `fontDimen', but some just need to be known explicitly). Instead of
            //going through all the math and guessing at font parameters, the numerator and denomina-
            // tor are placed pretty much right on top of the fraction bar. It seems to work, so not
            // really a problem there.
  
            // Even though the current token is already the nucleus of an atom, it still needs
            // to be recognized as its own atom for the `placeHTML` function. That's why an
            // `atomWrapper' is made for the fraction. It'll be added as an atom inside its own box,
            // which will then become the nucleus of the outer atom.
            let atomWrapper = {
              type: "atom",
              atomType: atomTypes.INNER,
              nucleus: null,
              superscript: null,
              subscript: null,
              style: style,
              div: document.createElement("div")
            };
            items.push(atomWrapper);
            atoms.push(atomWrapper);
            token.style = style;
            token.div = atomWrapper.div;
            token.div.style.display = "inline-block";
            token.div.style.whiteSpace = "nowrap";
  
            // A fraction's bar is always supposed to be centered on the line, regardless of the sizes
            // of its numerator and denominator. The "center of the line" is assumed to be half the ex
            // height of the font (the same as vertical-align: middle).
            let axisHeight = fontDimen.heightOf("x", family) / 2 +
                fontDimen.baselineHeightOf(family);
  
            let numer = document.createElement("div");
            let denom = document.createElement("div");
            numer.style.display = denom.style.display = "inline-block";
            numer.style.verticalAlign = "text-bottom";
            numer.style.position = "relative";
            denom.style.verticalAlign = "text-bottom";
            denom.style.position = "relative";
  
            // Fractions demote the style of its numerator and denominator.
            let demotedStyle =
                style == "display" ? "text" :
                style == "text" ? "script" :
                "scriptscript";
            newBox(
              token.numerator,
              demotedStyle,
              cramped,
              font,
              numer
            );
            newBox(
              token.denominator,
              demotedStyle,
              true, // A fraction's denominator is always made in a cramped style
              font,
              denom
            );
            numer.firstElementChild.style.justifyContent = "center";
            denom.firstElementChild.style.justifyContent = "center";
  
            // The fraction's bar may be set explicitly, or be guessed from the font's width.
            let barWidthDimen =
                token.barWidth == "from font" ?
                  new DimenReg(0, fontDimen.visibleWidthOf('|', family) * 65536) :
                  new DimenReg(token.barWidth);
            // Converts the dimension's sp units into em units to make it relative (scalable) instead.
            barWidthDimen.em.value += barWidthDimen.sp.value / 12 * 16 / fontSize;
            barWidthDimen.sp.value = 0;
  
            // Boolean indicating if the text will end up being scaled down, since only \textstyle
            // and \scriptstyle atoms actually have their numerators and denominators rendered in a
            // smaller size.
            let textOrScript = style == "text" || style == "script";
            let textOrScriptMultiplier = textOrScript ? rootHalf : 1;
  
            // Make the bar's width into CSS units.
            let unscaledBarWidth = `${barWidthDimen.em.value / 65536}em`;
            let barWidth = `${barWidthDimen.em.value *
                textOrScriptMultiplier / 65536}em`;
  
            // The bar's width, in em units, scaled to match the text around it.
            let finalBarWidth = barWidthDimen.em.value *
                (style == "script" || style == "scriptscript" ? rootHalf : 1) / 65536;
  
            // The heights and widths of the numerators and denominators are measured here. The widths
            // are important in determining which of the two are thicker (the thicker needs to be
            // placed first). The heights are used to vertically position the numerator/denominator
            // right above/below the bar.
  
            // BUG: This method assumes `container` is actually present on the page to measure them.
            // If it's not, the heights and width are going to measure to be 0, which throws off the
            // positioning of everything that depends on these measurements. We can't however just
            // place them into a random node like `document` that is guaranteed to be on the page
            // because the `container` (most likely) has styles applied to it that will affect the 
            // measurement we actually want and the one we would end up getting. 
            // This bug however does not end up presenting itself because when the user goes to add
            // the document into the page, a MutationObserver sees this and forces the element to re-
            // render itself, this time with the element being inside the page.
            // https://github.com/ChristianFigueroa/FontTeX/issues/1
  
            container.appendChild(denom);
            container.appendChild(numer);
  
            let numerWidth = numer.offsetWidth + 1; // + 1 for tolerance since .offsetWidth rounds.
            let numerHeight = numer.offsetHeight / fontSize;
            let numerScaledHeight = numerHeight * textOrScriptMultiplier;
            let numerScaledWidth = numerWidth * textOrScriptMultiplier;
  
            let denomHeight = denom.offsetHeight / fontSize;
            let denomWidth = denom.offsetWidth + 1;
            let denomScaledHeight = denomHeight * textOrScriptMultiplier;
            let denomScaledWidth = denomWidth * textOrScriptMultiplier;
  
            container.removeChild(denom);
            container.removeChild(numer);
  
            // Measurements have been gotten. Now add some style for the numerator and denominator.
            if (textOrScript) {
              numer.style.fontSize = denom.style.fontSize = rootHalfEm;
              numer.style.paddingTop = `calc(${axisHeight / rootHalf}em + ${unscaledBarWidth} / 2)`;
              numer.style.top = `calc(${-axisHeight / rootHalf}em - ${unscaledBarWidth} / 2)`;
              denom.style.top = `calc(${
                denomHeight - axisHeight / rootHalf
              }em + ${unscaledBarWidth} / 2 - ${denomHeight}em)`;
              token.div.style.paddingBottom =
                  `calc(${denomScaledHeight - axisHeight}em + ${barWidth} / 2)`;
            } else {
              numer.style.fontSize = denom.style.fontSize = "";
              numer.style.paddingTop = `calc(${axisHeight}em + ${barWidth} / 2)`;
              numer.style.top = `calc(${-axisHeight}em - ${barWidth} / 2)`;
              denom.style.top =
                  `calc(${denomHeight - axisHeight}em + ${barWidth} / 2 - ${denomHeight}em)`;
              token.div.style.paddingBottom = `calc(${denomHeight - axisHeight}em + ${barWidth} / 2)`;
            }
  
            // If the denominator is big enough, it may affect the height of the overall fraction,
            // which is not what we want. To prevent that, we have to set its height to 0.
            denom.style.height = 0;
  
            // Set `thinner` and `thicker` to the thinner/thicker of the numerator/denominator.
            let thinner = numerWidth > denomWidth ? denom : numer;
            let thicker = numerWidth > denomWidth ? numer : denom;
  
            // First, the fraction's bar needs to be added. There are three elements for the bar. The
            // first, outer element has no height or width so that it won't interfere with any other
            // elements' positioning; it will hold the visible part of the bar that the user sees. The
            // outer element then has another element inside it. That's where the displayed fraction
            // bar goes. It is positioned in the middle of the line with no height. It has a border-
            // top with the width of the bar and its background color set to the color of its parents
            // (so that it takes the same color as the text instead of the background). Within that
            // element is another. It gives the bar its width. Since we already measured the widths
            // earlier, we can just set a width on the bar in terms of em units so that it can scale
            // if necessary.
  
            // The outermost element that prevents position problems
            let barCont = document.createElement("div"); 
            // The middle element that will have its border-top be the bar,
            let bar = document.createElement("div");
            // The innermost element that sets the width of the fraction bar.
            let widthCont = document.createElement('div');
  
            barCont.style.display = "inline-block";
            barCont.style.position = "relative";
            barCont.style.verticalAlign = "text-bottom";
            barCont.style.top = `${-axisHeight}em`;
            barCont.style.width = ".05em"; // The fraction's bar actually overhangs past the numerator
                // denominator's width a bit, so 0.05em is used instead of 0 to add a small offset.
            barCont.style.height = 0;
  
            bar.style.borderTop = `${barWidth} solid currentColor`; // `currentColor` is a CSS vari-
                // able that is always set to the parent's `color` style.
            bar.style.padding = "0 .05em"; // 0.05em used again for that small offset.
            bar.style.position = "relative";
            bar.style.top = `calc(${barWidth} / -2)`;
            bar.style.display = "inline-block";
            bar.style.height = 0;
  
            widthCont.style.display = "inline-block";
            widthCont.style.visibility = "hidden";
            barCont.style.webkitUserSelect =
                barCont.style.mozUserSelect =
                barCont.style.msUserSelect =
                barCont.style.userSelect = "none";
            widthCont.style.width = `${Math.max(numerScaledWidth, denomScaledWidth) / fontSize}em`;
  
            bar.appendChild(widthCont);
            barCont.appendChild(bar);
            token.div.appendChild(barCont);
  
            // The bar has been placed in the fraction, so now the numerator and denominator need to
            // be placed. To make the entire fraction take up the correct space, the thicker of the
            // two is used as the width of the entire fraction. That means the thinner one is placed
            // first, and has its width set to 0. Then the thicker one is placed at its natural width.
            // The thicker one is all set, but the thinner one needs to be repositioned to *look* like
            // its taking up the full width of the fraction. To do that, the thinner box is placed in-
            // to a flex-box that takes up the same width as the thicker of the two. That box gets its
            // width and height set by adding more elements into it with the correct sizes. Finally,
            // two stretchable elements are prepended and appended to the flex-box. They stretch to
            // make the content be centered (but they still allow the user to use an \hfil to make
            // "stronger" stretchy elements).
  
            let thinContainer = document.createElement("div");
            let flexContainer = document.createElement("div");
            let spacingOffset = document.createElement("div");
            let flexChild = thinner.firstElementChild;
  
            // Add the stretchable elements, if necessary.
            if (flexChild) {
              flexChild.style.width = "100%";
              flexContainer.appendChild(flexChild);
            }
            thinContainer.style.position = "relative";
            thinContainer.style.display = "inline-block";
  
            spacingOffset.style.display = "inline-block";
            spacingOffset.style.height = `${numerWidth > denomWidth ? denomHeight : numerHeight}em`;
            spacingOffset.textContent = "\u00A0"; // No break space character
            // A very rare bug happens where the fraction will line wrap when it isn't supposed to,
            // so + 1 is added to prevent that.
            spacingOffset.style.width = `${(Math.max(numerWidth, denomWidth) + 1) / fontSize}em`;
  
            flexContainer.style.position = "absolute";
  
            thinner.style.width = 0;
            flexContainer.style.left = `${-1 / fontSize}em`;
            flexContainer.style.right = `${1 / fontSize}em`;
            flexContainer.style.top = 0;
  
            thinContainer.appendChild(flexContainer);
            thinContainer.appendChild(spacingOffset);
            thinner.appendChild(thinContainer);
            token.div.appendChild(thinner);
            token.div.appendChild(thicker);
  
            // Since the fraction bar goes out an extra .05em past its numerator and denominator
            // parts, an extra width: .05em element needs to be added after the fraction to offset
            // anything that comes after it.
            let widthOffset = document.createElement("div");
            widthOffset.style.display = "inline-block";
            widthOffset.style.width = ".05em";
            token.div.appendChild(widthOffset);
  
  
            // Fractions are allowed to have delimiters like \left and \right. The only real differ-
            // ence is that fractions' delimiters have a height dependent on the current style, not
            // the height of the encompassed fraction.
  
            // Atom delimiters are handled in case 10. That's where this code was copied from
            // and where comments are that explain what's happening.
            let leftDelim = document.createElement("canvas");
            let rightDelim = document.createElement("canvas");
            let setHeight = style == "display" ? 2.416666666 : style == "text" ? 1.416666666 : 0;
  
            leftDelim.style.display = rightDelim.style.display = 'inline-block';
  
            if (token.delims[0] == '>') token.delims[0] = '⟩';
            if (token.delims[1] == '>') token.delims[1] = '⟩';
            if (token.delims[0] == '<') token.delims[0] = '⟨';
            if (token.delims[1] == '<') token.delims[1] = '⟨';
  
            // `renderElem` is copied from the other `renderElem` function defined later in the code.
            function renderElem(elem, delimiter, leftSide, scale) {
              let height;
              let context;
              let glyphHeight;
              let region;
              let topHalf, bottomHalf;
              let topRegion, bottomRegion;
              let topHalfRow, bottomHalfRow;
              switch (delimiter) {
                case '.':
                default:
                  items.splice(items.length - (leftSide ? 1 : 0), 0, {
                    type: "kern",
                    dimen: token.nullDelimiterSpace
                  });
                  break;
  
                case '|':
                case '/':
                case '\\':
                case '‖':
                case '⎪':
                case '⏐':
                case '⟨':
                case '⟩':
                  height =
                      Math.max(
                        setHeight,
                        fontDimen.heightOf(delimiter, family) +
                          fontDimen.depthOf(delimiter, family)
                      );
  
                  elem.style.height = `${height}em`;
                  elem.style.width = `${fontDimen.widthOf(delimiter, family)}em`;
                  elem.style.verticalAlign = "middle";
  
                  elem.height = scale;
                  elem.width =
                      fontDimen.widthOf(delimiter, family) /
                      (fontDimen.heightOf(delimiter, family) +
                        fontDimen.depthOf(delimiter, family)) * scale;
                  context = elem.getContext("2d");
                  context.textAlign = "center";
                  context.fillStyle = cssDeclaration.color;
  
                  context.font =
                      `${
                        scale / (fontDimen.heightOf(delimiter, family) +
                          fontDimen.depthOf(delimiter, family))
                      }px ${family}`;
                  context.fillText(
                    delimiter,
                    elem.width / 2,
                    scale - fontDimen.depthOf(delimiter, family) * scale /
                      (fontDimen.heightOf(delimiter, family) +
                      fontDimen.depthOf(delimiter, family))
                  );
                  token.div.insertBefore(elem, leftSide ? token.div.firstElementChild : null);
                  break;
  
                case '(':
                case ')':
                  height =
                      Math.max(
                        setHeight,
                        fontDimen.heightOf(delimiter, family) +
                          fontDimen.depthOf(delimiter, family)
                      );
                  elem.style.height = `${height}em`;
                  elem.style.width = `${fontDimen.widthOf(delimiter, family)}em`;
                  elem.style.verticalAlign = "middle";
                  if (Math.floor(Math.floor(scale / 2 * height) - scale) <= 0) {
                    elem.height = scale;
                    elem.width =
                        fontDimen.widthOf(delimiter, family) /
                        (fontDimen.heightOf(delimiter, family) +
                        fontDimen.depthOf(delimiter, family)) * scale;
                    context = elem.getContext("2d");
                    context.textAlign = "center";
                    context.fillStyle = cssDeclaration.color;
                    context.font =
                        `${
                          scale / (fontDimen.heightOf(delimiter, family) +
                            fontDimen.depthOf(delimiter, family))
                        }px ${family}`;
                    context.fillText(
                      delimiter,
                      elem.width / 2,
                      scale - fontDimen.depthOf(delimiter, family) * scale /
                        (fontDimen.heightOf(delimiter, family) +
                        fontDimen.depthOf(delimiter, family))
                    );
                  } else {
                    glyphHeight =
                        fontDimen.heightOf(delimiter, family) +
                        fontDimen.depthOf(delimiter, family);
                    elem.height = Math.max(height, 1) * scale;
                    elem.width =
                        fontDimen.widthOf(delimiter, family) /
                        fontDimen.heightOf(delimiter, family) * scale *
                        (fontDimen.heightOf(delimiter, family) +
                          fontDimen.depthOf(delimiter, family));
                    context = elem.getContext("2d");
                    context.textAlign = "center";
                    context.fillStyle = cssDeclaration.color;
                    context.font = `${scale / glyphHeight}px ${family}`;
                    context.fillText(
                      delimiter,
                      elem.width / 2,
                      scale / 2 - fontDimen.depthOf(delimiter, family) * scale * glyphHeight
                    );
                    bottomHalf = context.getImageData(0, 0, elem.width, scale / 2);
                    context.clearRect(0, 0, elem.width, elem.height);
                    context.fillText(
                      delimiter,
                      elem.width / 2,
                      scale - fontDimen.depthOf(delimiter, family) * scale / glyphHeight
                    );
                    context.clearRect(0, scale / 2, elem.width, elem.height);
                    context.putImageData(bottomHalf, 0, elem.height - scale / 2);
                    if (elem.height > scale) {
                      region = context.createImageData(elem.width, elem.height - scale);
                      topHalfRow = context.getImageData(0, scale / 2 - 1, elem.width, 1).data;
                      bottomHalfRow = bottomHalf.data.slice(0, elem.width * 4);
                      for (let i = 0, l = region.height / 2; i < l; i++) {
                        for (let n = 0, j = elem.width; n < j; n++) {
                          let pixelOffset = i * elem.width * 4 + n * 4;
                          region.data[pixelOffset + 0] = topHalfRow[n * 4 + 0];
                          region.data[pixelOffset + 1] = topHalfRow[n * 4 + 1];
                          region.data[pixelOffset + 2] = topHalfRow[n * 4 + 2];
                          region.data[pixelOffset + 3] = topHalfRow[n * 4 + 3];
  
                          pixelOffset = ~~(i + region.height / 2) * elem.width * 4 + n * 4;
                          region.data[pixelOffset + 0] = bottomHalfRow[n * 4 + 0];
                          region.data[pixelOffset + 1] = bottomHalfRow[n * 4 + 1];
                          region.data[pixelOffset + 2] = bottomHalfRow[n * 4 + 2];
                          region.data[pixelOffset + 3] = bottomHalfRow[n * 4 + 3];
                        }
                      }
                      context.putImageData(region, 0, scale / 2);
                    }
                  }
                  token.div.insertBefore(elem, leftSide ? token.div.firstElementChild : null);
                  break;
  
                case '[':
                case ']':
                case '⟮':
                case '⟯':
                case '↑':
                case '↓':
                case '↕':
                case '⇑':
                case '⇓':
                case '⇕':
                case '⌈':
                case '⌉':
                case '⌊':
                case '⌋':
                case '⎰':
                case '⎱':
                  axisHeight = fontDimen.heightOf("x", family) / 2;
                  height =
                      Math.max(
                        setHeight,
                        fontDimen.heightOf(delimiter, family) +
                          fontDimen.depthOf(delimiter, family)
                        );
                  elem.style.height = `${height}em`;
                  elem.style.width = `${fontDimen.widthOf(delimiter, family)}em`;
                  elem.style.verticalAlign = "middle";
                  glyphHeight =
                      fontDimen.heightOf(delimiter, family) +
                      fontDimen.depthOf(delimiter, family);
                  elem.height = Math.max(height, 1) * scale;
                  elem.width =
                      fontDimen.widthOf(delimiter, family) /
                      fontDimen.heightOf(delimiter, family) * scale *
                      (fontDimen.heightOf(delimiter, family) +
                        fontDimen.depthOf(delimiter, family));
                  context = elem.getContext("2d");
                  context.textAlign = "center";
                  context.fillStyle = cssDeclaration.color;
                  context.font = `${scale / glyphHeight}px ${family}`;
                  context.fillText(
                    delimiter,
                    elem.width / 2,
                    scale / 2 - fontDimen.depthOf(delimiter, family) * scale * glyphHeight
                  );
                  bottomHalf = context.getImageData(0, 0, elem.width, scale / 2);
                  context.clearRect(0, 0, elem.width, elem.height);
                  context.fillText(
                    delimiter,
                    elem.width / 2,
                    scale - fontDimen.depthOf(delimiter, family) * scale / glyphHeight
                  );
                  context.clearRect(0, scale / 2, elem.width, elem.height);
                  context.putImageData(bottomHalf, 0, elem.height - scale / 2);
  
                  if (elem.height > scale) {
                    region = context.createImageData(elem.width, elem.height - scale);
                    topHalfRow = context.getImageData(0, scale / 2 - 1, elem.width, 1).data;
                    bottomHalfRow = bottomHalf.data.slice(0, elem.width * 4);
                    for (let i = 0, l = region.height / 2; i < l; i++) {
                      for (let n = 0, j = elem.width; n < j; n++) {
                        let pixelOffset = i * elem.width * 4 + n * 4;
                        region.data[pixelOffset + 0] = topHalfRow[n * 4 + 0];
                        region.data[pixelOffset + 1] = topHalfRow[n * 4 + 1];
                        region.data[pixelOffset + 2] = topHalfRow[n * 4 + 2];
                        region.data[pixelOffset + 3] = topHalfRow[n * 4 + 3];
  
                        pixelOffset = ~~(i + region.height / 2) * elem.width * 4 + n * 4;
                        region.data[pixelOffset + 0] = bottomHalfRow[n * 4 + 0];
                        region.data[pixelOffset + 1] = bottomHalfRow[n * 4 + 1];
                        region.data[pixelOffset + 2] = bottomHalfRow[n * 4 + 2];
                        region.data[pixelOffset + 3] = bottomHalfRow[n * 4 + 3];
                      }
                    }
                    context.putImageData(region, 0, scale / 2);
                  }
  
                  token.div.insertBefore(elem, leftSide ? token.div.firstElementChild : null);
                  break;
  
                case '{':
                case '}':
                  height =
                      Math.max(
                        setHeight,
                        fontDimen.heightOf(delimiter, family) +
                          fontDimen.depthOf(delimiter, family)
                      );
                  elem.style.height = `${height}em`;
                  elem.style.width = `${fontDimen.widthOf(delimiter, family)}em`;
                  elem.style.verticalAlign = "middle";
                  glyphHeight =
                      scale / (fontDimen.heightOf(delimiter, family) +
                        fontDimen.depthOf(delimiter, family));
                  elem.height = Math.max(height, 1) * scale;
                  elem.width =
                      fontDimen.widthOf(delimiter, family) /
                      fontDimen.heightOf(delimiter, family) * scale *
                      (fontDimen.heightOf(delimiter, family) +
                        fontDimen.depthOf(delimiter, family));
                  context = elem.getContext("2d");
                  context.textAlign = "center";
                  context.fillStyle = cssDeclaration.color;
                  context.font = `${glyphHeight}px ${family}`;
  
                  if (scale >= 3) {
                    context.fillText(
                      delimiter,
                      elem.width / 2,
                      Math.floor(scale / 3) - fontDimen.depthOf(delimiter, family) *
                        glyphHeight
                    );
                    bottomHalf = context.getImageData(0, 0, elem.width, Math.floor(scale / 3));
                    context.clearRect(0, 0, elem.width, elem.height);
                    context.fillText(
                      delimiter,
                      elem.width / 2,
                      scale - fontDimen.depthOf(delimiter, family) * glyphHeight
                    );
                    topHalf = context.getImageData(0, 0, elem.width, Math.floor(scale / 3));
                    context.clearRect(0, 0, elem.width, elem.height);
                    context.fillText(
                      delimiter,
                      elem.width / 2,
                      elem.height / 2 + scale / 2 - fontDimen.depthOf(delimiter, family) *
                       glyphHeight
                    );
                    context.clearRect(
                      0,
                      0,
                      elem.width,
                      Math.floor(elem.height / 2) - Math.floor(scale / 2) + Math.floor(scale / 3)
                    );
                    context.clearRect(
                      0,
                      Math.ceil(elem.height / 2) + Math.floor(scale / 2) - Math.floor(scale / 3),
                      elem.width,
                      elem.height
                    );
                    context.putImageData(topHalf, 0, 0);
                    context.putImageData(bottomHalf, 0, elem.height - Math.floor(scale / 3));
                    if (elem.height > scale) {
                      topRegion =
                          context.createImageData(
                            elem.width,
                            Math.ceil((elem.height - scale) / 2)
                          );
                      topHalfRow =
                          topHalf.data.slice(
                            (Math.floor(scale / 3) - 1) * elem.width * 4,
                            Math.floor(scale / 3) * elem.width * 4
                          );
                      bottomHalfRow =
                          context.getImageData(
                            0,
                            Math.floor(elem.height / 2) - Math.floor(scale / 2) +
                              Math.floor(scale / 3),
                            elem.width,
                            1
                          ).data;
                      for (let i = 0, l = topRegion.height / 2; i < l; i++) {
                        for (let n = 0, j = elem.width; n < j; n++) {
                          let pixelOffset = i * elem.width * 4 + n * 4;
                          topRegion.data[pixelOffset + 0] = topHalfRow[n * 4 + 0];
                          topRegion.data[pixelOffset + 1] = topHalfRow[n * 4 + 1];
                          topRegion.data[pixelOffset + 2] = topHalfRow[n * 4 + 2];
                          topRegion.data[pixelOffset + 3] = topHalfRow[n * 4 + 3];
  
                          pixelOffset = ~~(i + topRegion.height / 2) * elem.width * 4 + n * 4;
                          topRegion.data[pixelOffset + 0] = bottomHalfRow[n * 4 + 0];
                          topRegion.data[pixelOffset + 1] = bottomHalfRow[n * 4 + 1];
                          topRegion.data[pixelOffset + 2] = bottomHalfRow[n * 4 + 2];
                          topRegion.data[pixelOffset + 3] = bottomHalfRow[n * 4 + 3];
                        }
                      }
                      bottomRegion =
                          context.createImageData(
                            elem.width,
                            Math.floor(elem.height / 2) - Math.floor(scale / 2) + 1
                          );
                      topHalfRow =
                          context.getImageData(
                            0,
                            Math.ceil(elem.height / 2) + Math.floor(scale / 2) -
                              Math.floor(scale / 3) - 1,
                            elem.width,
                            1
                          ).data;
                      bottomHalfRow = bottomHalf.data.slice(0, elem.width * 4);
                      for (let i = 0, l = bottomRegion.height / 2; i < l; i++) {
                        for (let n = 0, j = elem.width; n < j; n++) {
                          let pixelOffset = i * elem.width * 4 + n * 4;
                          bottomRegion.data[pixelOffset + 0] = topHalfRow[n * 4 + 0];
                          bottomRegion.data[pixelOffset + 1] = topHalfRow[n * 4 + 1];
                          bottomRegion.data[pixelOffset + 2] = topHalfRow[n * 4 + 2];
                          bottomRegion.data[pixelOffset + 3] = topHalfRow[n * 4 + 3];
  
                          pixelOffset = ~~(i + bottomRegion.height / 2) * elem.width * 4 + n * 4;
                          bottomRegion.data[pixelOffset + 0] = bottomHalfRow[n * 4 + 0];
                          bottomRegion.data[pixelOffset + 1] = bottomHalfRow[n * 4 + 1];
                          bottomRegion.data[pixelOffset + 2] = bottomHalfRow[n * 4 + 2];
                          bottomRegion.data[pixelOffset + 3] = bottomHalfRow[n * 4 + 3];
                        }
                      }
                      context.putImageData(
                        topRegion,
                        0,
                        Math.floor(scale / 3)
                      );
                      context.putImageData(
                        bottomRegion,
                        0,
                        elem.height / 2 + Math.floor(scale / 2) - Math.floor(scale / 3)
                      );
                    }
                  }
                  token.div.insertBefore(elem, leftSide ? token.div.firstElementChild : null);
                  break;
              }
            }
  
            renderElem(leftDelim, token.delims[0], true, fontSize);
            renderElem(rightDelim, token.delims[1], false, fontSize);
  
  
            // If the fraction is being rendered in a different font size than normal, the
            // height and depth need to change accordingly.
            let multiplier = ({
              display: {
                display: 1,
                text: 1,
                script: rootHalf,
                scriptscript: .5
              },
              text: {
                display: 1,
                text: 1,
                script: rootHalf,
                scriptscript: .5
              },
              script: {
                display: root2,
                text: root2,
                script: 1,
                scriptscript: rootHalf
              },
              scriptscript: {
                display: 2,
                text: 2,
                script: root2,
                scriptscript: 1
              }
            })[flex.displayedStyle][style];
  
  
            // The whole fraction has been created now. All that's left is to calculate a new height
            // and depth. There's a lot of calculations since the fraction is centered on the line,
            // but each of the numerator and denominator have their own height.
            let exHeight = fontDimen.heightOf("x", family) / 2;
            token.div.renderedDepth =
                ((denomScaledHeight - exHeight + finalBarWidth / 2) +
                  (denom.renderedDepth - denom.baseline - denom.baselineOffset) *
                  textOrScriptMultiplier) * multiplier;
            token.div.renderedHeight =
                ((exHeight + finalBarWidth / 2) +
                  (numer.baseline + numer.baselineOffset + numer.renderedHeight) *
                  textOrScriptMultiplier) * multiplier;
            token.div.baseline =
                denom.baseline * multiplier * textOrScriptMultiplier;
            token.div.baselineOffset =
                ((denomScaledHeight - exHeight + finalBarWidth / 2) -
                  denom.baseline * textOrScriptMultiplier) * multiplier;
  
            // Since a fraction doesn't really count as a character, `lastChar' is set to just
            // a space (a character without an italic correction).
            lastChar = " ";
            continue;
          }
  
          // Create a <table> for \haligns
          if (token.type == "table") {
            // The table is wrapped inside its own atom just like a fraction is above.
            let atomWrapper = {
              type: "atom",
              atomType: atomTypes.INNER,
              nucleus: null,
              superscript: null,
              subscript: null,
              style: style,
              div: document.createElement("div")
            };
  
            items.push(atomWrapper);
            atoms.push(atomWrapper);
            token.style = style;
            token.div = atomWrapper.div;
            token.div.style.display = "inline-block";
            token.div.style.whiteSpace = "nowrap";
  
            let table = document.createElement("table");
            table.style.borderCollapse = "collapse";
            table.style.verticalAlign = "middle";
            table.style.display = "inline-table";
  
            // Iterate over the table's rows
            for (let r = 0, l = token.cellData.length; r < l; r++) {
              // If the row has a \noalign associated with it, make a <tr> above it that will span the
              // entire row and insert the contents into it.
              if (token.noAligns[r]) {
                let noAlign = document.createElement("td");
                noAlign.setAttribute("colspan", token.tabSkips.length - 1);
                noAlign.style.padding = 0;
                newBox([token.noAligns[r]], style, false, font, noAlign);
                table.appendChild(noAlign);
                noAlign.firstElementChild.style.width = "100%";
                noAlign.firstElementChild.style.justifyContent = "";
              }
  
              // Now make the row after the \noalign (if there was any).
              let row = document.createElement("tr");
              // Iterate over the row's columns.
              for (let c = 0, j = token.cellData[r].length; c < j; c++) {
                let cell = document.createElement("td");
                cell.setAttribute("colspan", token.cellData[r][c].span);
                cell.style.padding = 0;
                // Left padding is determined by the \tabskip parameter that was captured beforehand
                // for this column.
                cell.style.paddingLeft = `${token.tabSkips[c].start.em.value / 65536 +
                    token.tabSkips[c].start.sp.value / 65536 / 12}em`;
  
                // If this is the last column, add a right padding as well for the final \tabskip.
                if (c == token.tabSkips.length - 2) {
                  cell.style.paddingRight = `${token.tabSkips[c + 1].start.em.value / 65536 +
                      token.tabSkips[c + 1].start.sp.value / 65536 / 12}em`;
                }
  
                newBox(token.cellData[r][c].content, style, false, font, cell);
                row.appendChild(cell);
                cell.firstElementChild.style.width = "100%";
                cell.firstElementChild.style.justifyContent = "";
              }
  
              table.appendChild(row);
            }
  
            // Rendered dimensions can't really be calculated without appending the child to the DOM
            // temporarily and checking.
            token.div.appendChild(table);
            container.appendChild(token.div);
            token.div.renderedHeight = token.div.offsetHeight / fontSize / 2 +
                fontDimen.heightOf("x", family) / 2;
            token.div.renderedDepth = token.div.offsetHeight / fontSize / 2 -
                fontDimen.heightOf("x", family) / 2;
            container.removeChild(token.div);
            continue;
          }
  
          if (token.type == "atom" || token.type == "box" && token.content.type == "atom") {
            let box = false;
            if (token.type == "box") {
              box = token;
              token = token.content;
            }
  
            // `multiplier` is the scale factor an atom is scaled by to appear the same font-size as
            // its neighboring atoms of the same type. A \textstyle atom within a \scriptstyle group
            // needs to be scaled up by sqrt(2) to appear the same size as other \scriptstyle elem-
            // ents.
            let multiplier = ({
              display: {
                display: 1,
                text: 1,
                script: rootHalf,
                scriptscript: 0.5
              },
              text: {
                display: 1,
                text: 1,
                script: rootHalf,
                scriptscript: 0.5
              },
              script: {
                display: root2,
                text: root2,
                script: 1,
                scriptscript: rootHalf
              },
              scriptscript: {
                display: 2,
                text: 2,
                script: root2,
                scriptscript: 1
              }
            })[flex.displayedStyle][style];
  
            // Certain atoms need to be placed inside their own Ord atoms and their super/subscripts
            // placed on that new Ord atom instead of the original one. An Over or Under atom with a
            // super/subscript needs its nucleus to be rendered, then the line placed over/under it,
            // then its super/subscript placed outside of that line. A Rad atom with a multiplier
            // other than 1 also doesn't render correctly, so the entire Rad atom is placed inside its
            // own atom to have the `multiplier` be 1.
            if (([atomTypes.OVER, atomTypes.UNDER, atomTypes.RAD].includes(token.atomType) &&
                (token.subscript || token.superscript)) ||
                (token.atomType == atomTypes.RAD && multiplier != 1)) {
              token.nucleus = [{
                type: "atom",
                atomType: token.atomType,
                nucleus: token.nucleus,
                superscript: null,
                subscript: null,
                index: token.index,
                invalid: token.invalid,
                phantom: token.phantom
              }];
              token.atomType = atomTypes.ORD;
            }
  
            // Start rendering the atom in a <div> element.
            items.push(token);
            atoms.push(token);
            token.style = style;
            token.div = document.createElement("div");
            token.div.style.display = "inline-block";
            token.div.style.whiteSpace = "nowrap";
            token.div.renderedHeight = 0;
            token.div.renderedDepth = -.5;
            token.div.baselineOffset = 0;
  
            // If the token is marked as invalid, propagate that "invalid" status to the atom's compo-
            // nents.
            if (token.invalid) {
              if (token.nucleus) {
                if (token.nucleus.type == "symbol") {
                  token.nucleus.invalid = true;
                } else {
                  for (let i = token.nucleus.length - 1; i >= 0; i--) {
                    token.nucleus[i].invalid = true;
                  }
                }
              }
              if (token.superscript) {
                token.superscript[0].invalid = true;
              }
              if (token.subscript) {
                token.subscript[0].invalid = true;
              }
            }
  
            // Most atoms have been collapsed before this so that "{{{a}}}" will just be recognized as
            // "a". Instead of being treated as a completely separate atom with a sub-nucleus, it is
            // treated as a regular symbol. This is important for rendering Acc atoms correctly. Op
            // atoms are special though since they can have large version and may or may not have
            // their \limit property enabled. This `if` block will check if an Op atom can be un-
            // wrapped or not.
            if ([
                atomTypes.ORD,
                atomTypes.OP,
                atomTypes.BIN,
                atomTypes.REL,
                atomTypes.OPEN,
                atomTypes.CLOSE,
                atomTypes.PUNCT,
                atomTypes.INNER
              ].includes(token.atomType) &&
              token.nucleus &&
              token.nucleus.length == 1 &&
              token.nucleus[0].atomType == atomTypes.OP &&
              !token.nucleus[0].delimited &&
              !token.nucleus[0].limits &&
              !token.superscript &&
              !token.subscript &&
              !(
                token.nucleus[0].nucleus && (
                  (
                    token.nucleus[0].nucleus.type == "symbol" &&
                    settings["operator.growchars"][0].includes(token.nucleus[0].nucleus.char)
                  ) || (
                    token.nucleus[0].nucleus.length == 1 &&
                    token.nucleus[0].nucleus[0].atomType == atomTypes.VARIABLE &&
                    settings["operator.growchars"][0].includes(
                      token.nucleus[0].nucleus[0].nucleus[0].char)
                  )
                )
              )
            ) {
              token.superscript = token.nucleus[0].superscript;
              token.subscript = token.nucleus[0].subscript;
              token.nucleus = token.nucleus[0].nucleus;
            }
  
            // `scriptOffset` controls how much a superscript is shifted over compared to the sub-
            // script. This only applies for atoms whose nucleus is a single character (like \int).
            let scriptOffset = 0;
  
            if (token.nucleus && token.nucleus.type == "symbol") {
              // Render an atom with a single character in it
              if (token.nucleus.code == 0x000A /* New Line character U+000A */) {
                // If the atom's nucleus is a line break, (probably produced by "\\"), it should break
                // the flex-box by adding a 100% width element. It should also start a new child flex-
                // box though so that it'll actually be allowed to wrap.
                token.isLineBreak = true;
                token.div.style.width = "100%";
              } else {
                // In \normalfont, characters of family 7 (variables) are italicized. By default, that
                // includes all lowercase and uppercase Latin letter and lowercase Greek letters. They
                // also receive an italic correction after them (compare \normalfont and \it). 
                token.div.innerHTML =
                    `<div style="white-space:pre;display:inline-block;${
                      token.nucleus.invalid ? `color:${settings["invalid.color"][0]};` : ""
                    }${({
                      nm: token.atomType == atomTypes.VARIABLE ?
                        `font-style:italic"><div style="display:inline-block;margin:0 ${
                          // Add an italic correction spacing after every \normalfont character.
                          fontDimen.italCorrOf(token.nucleus.char, family)
                        }em 0 ${
                          // This aligns a character to the left side of its boundary box.
                          fontDimen.leftOffsetOf(token.nucleus.char, family, 'it')
                        }em` : "",
                      rm: "",
                      bf: "font-weight:bold;", // Make \bf bold
                      it: "font-style:italic;", // Make \it italic
                      sl: "font-style:oblique;" // Make \sl slanted (oblique)
                    }[font])}">${
                      token.nucleus.code == 0x002D /* Hyphen-Minus U+002D */ ?
                        "\u2212" : // Change hyphens into subtraction characters
                        token.nucleus.char
                    }</div>${
                      font == "nm" && token.atomType == atomTypes.VARIABLE ? "</div>" : ""
                    }`;
  
                let fontStyle =
                    font == "nm" ?
                      token.atomType == atomTypes.VARIABLE ? "it" : "nm" :
                      font;
                token.div.renderedHeight =
                    fontDimen.heightOf(token.nucleus.char, family, fontStyle) * multiplier;
                token.div.renderedDepth =
                    fontDimen.trueDepthOf(token.nucleus.char, family, fontStyle) * multiplier;
                token.div.baseline =
                    fontDimen.baselineHeightOf(family) * multiplier;
  
                scriptOffset = fontDimen.scriptOffsetOf(
                    token.nucleus.char,
                    family,
                    font == "nm" && token.atomType == atomTypes.VARIABLE ? "it" : font);
              }
              lastChar = token.nucleus.char;
            } else if (Array.isArray(token.nucleus)) {
              // Render an atom with another list of tokens in its nucleus.
              lastChar =
                  newBox(
                    token.nucleus,
                    style,
                    // Makes Over and Rad atoms render in cramped style
                    cramped || token.atomType == atomTypes.OVER || token.atomType == atomTypes.RAD,
                    font,
                    token.div
                  ) || lastChar;
  
              token.div.renderedHeight *= multiplier;
              token.div.renderedDepth *= multiplier;
              token.div.baseline *= multiplier;
              token.div.baselineOffset *= multiplier;
  
              // If the token is completely empty, mark it as such.
              if (
                  token.div.firstElementChild.empty &&
                  !token.superscript &&
                  !token.subscript &&
                  !token.delimited &&
                  ![
                    atomTypes.RAD,
                    atomTypes.ACC,
                    atomTypes.OVER,
                    atomTypes.UNDER
                  ].includes(token.atomType)) {
                token.div.empty = true;
              }
            }
  
            // If the atom was marked as a phantom atom (from \phantom), it's nucleus is made invisi-
            // ble with visibility: hidden. It will still take up the normal amount of space and be
            // treated exactly as if it wasn't a phantom atom.
            if (token.phantom) {
              token.div.firstElementChild.style.visibility = "hidden";
            }
  
            // Now a font-size needs to be set on the element to show differences between styles (e.g.
            // if a \displaystyle was found inside a \scriptstyle group).
            token.div.style.fontSize = `${multiplier}em`;
  
            // If the atom is an Op atom and the nucleus is a single character, the character might
            // have to be made bigger. The list of characters that get scaled up is stored in the
            // settings["operator.growchars"] setting.
            if (style == "display" &&
              token.atomType == atomTypes.OP &&
              token.nucleus && (
                token.nucleus.type == "symbol" || (
                  token.nucleus.length == 1 &&
                  token.nucleus[0].nucleus &&
                  token.nucleus[0].nucleus.type == "symbol" &&
                  token.nucleus[0].atomType == atomTypes.VARIABLE
                )
              )) {
  
              // The scale factor for growing the Op atom (if it needs to be scaled).
              let growAmt = 1;
  
              if (settings["operator.growchars"][0].includes(
                  token.nucleus.char || token.nucleus[0].nucleus.char)) {
                growAmt = settings["operator.growamount"][0];
                token.div.renderedHeight *= growAmt;
                token.div.renderedDepth *= growAmt;
                token.div.firstElementChild.style.fontSize = `${growAmt}em`;
                scriptOffset *= growAmt;
              }
  
              // Get the vertical middle of the line to center the atom.
              let axisHeight = fontDimen.heightOf("x", family) / 2;
              // The offset to shift the atom down by to center it.
              let offset =
                  (token.div.renderedHeight - axisHeight - token.div.renderedDepth - axisHeight) / 2;
  
              token.div.firstElementChild.style.top = `${offset / growAmt}em`;
              token.div.renderedHeight -= offset;
              token.div.renderedDepth += offset;
              token.div.firstElementChild.style.position = "relative";
              token.div.firstElementChild.style.marginTop = `${-offset / growAmt}em`;
              token.div.firstElementChild.style.marginBottom = `${offset / growAmt}em`;
            }
  
            // If the current token is marked as delimited, then a pair of delimiters is added
            // to the div. Delimiters appear from \left ... \right pairs.
            if (token.delimited) {
              // This function is responsible for making the drawing the delimiter on a <canvas> and
              // then inserting that image into an <img> element.
              function drawDelim(delimiter, leftSide, scale) {
                let region;
                let topHalf, bottomHalf;
                let topHalfRow, bottomHalfRow;
                let context;
                let svgHeight, svgWidth;
                const uuid = make_uuid();
                const axisHeight = fontDimen.heightOf("x", family) / 2;
                const leftOffset = fontDimen.leftOffsetOf(delimiter, family);
                const visibleWidth = fontDimen.visibleWidthOf(delimiter, family);
                const depth = fontDimen.depthOf(delimiter, family);
                const _height = fontDimen.heightOf(delimiter, family);
                const baseline = fontDimen.baselineHeightOf(family);
                const totalGlyphHeight = _height + depth;
                const dpr = window.devicePixelRatio;
                const stretchSize = 1;
  
                let img = document.createElement("img");
                let svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                let canvas = document.createElement("canvas");
  
                // The total height of the delimiter is found by taking the taller of the height and
                // depth of `token.div` (accounting for the offset from the baseline to the center of
                // the line) and multiplying by two. So even if there's a fraction or something with a
                // huge height but no depth, the delimiter will still act as if they had the same
                // height and depth. The minimum height of a delimiter is the normal height of the
                // unstretched delimiter so that even if the inside of the delimiters is empty or very
                // small, the delimiters can only *grow*, not shrink.
                let height = Math.max(
                  token.div.renderedHeight - axisHeight,
                  token.div.renderedDepth + axisHeight,
                  totalGlyphHeight / 2
                ) * 2;
  
                img.style.display = "inline-block";
                img.style.verticalAlign = "middle";
                img.style.height = `${height}em`;
                img.style.width = `${visibleWidth}em`;
                img.style.marginLeft = `${-leftOffset}em`;
                img.style.marginRight =
                  `${fontDimen.widthOf(delimiter, family) - visibleWidth + leftOffset}em`;
                svg.setAttribute("preserveAspectRatio", "none");
                img.alt = delimiter;
  
                svg.style.display = "inline-block";
                svg.style.verticalAlign = "middle";
                svg.style.height = `${height}em`;
                svg.style.width = `${visibleWidth}em`;
                svg.style.marginLeft = `${-leftOffset}em`;
                svg.style.marginRight =
                  `${fontDimen.widthOf(delimiter, family) - visibleWidth + leftOffset} em`;
  
                // The entire token's renderedHeight and renderedDepth is at least as much as the
                // delimiter's height and depth.
                token.div.renderedHeight =
                    Math.max(height / 2 + axisHeight, token.div.renderedHeight);
                token.div.renderedDepth =
                    Math.max(height / 2 - axisHeight, token.div.renderedDepth);
  
                // The <img> and <canvas> have their height and width set to the number of pixels
                // they take up on the screen. This ensures the image doesn't have to scale up or down
                // since doing so might mess up the antialiasing and make the <img> stand out from the
                // surrounding text.
                img.width = canvas.width = Math.ceil(visibleWidth / totalGlyphHeight * scale * dpr);
  
                switch (delimiter) {
                  case "|":
                  case "/":
                  case "\\":
                  case "‖":
                  case "⎪":
                  case "⏐":
                  case "⟨":
                  case "⟩":
                  default:
                    // This is the simplest case for a delimiter. We jut have to draw the character,
                    // and then hve it stretch out to match the required size. 
  
                    // Set the SVG viewBox to match the text.
                    svgHeight = scale * dpr;
                    svgWidth = visibleWidth / totalGlyphHeight * scale * dpr
                    svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
  
                    // Place the <text> inside the SVG.
                    svg.innerHTML = `
                      <text
                        fill="currentColor"
                        y="${(1 - depth / totalGlyphHeight) * scale * dpr}"
                        x="${leftOffset * scale * dpr}"
                        font-size="${scale / totalGlyphHeight * dpr}"
                      >${delimiter}</text>
                    `;
  
                    // Place the <svg> in the element.
                    token.div.insertBefore(svg, leftSide ? token.div.firstElementChild : null);
                    break;
  
                  case '(':
                  case ')':
                    // This block accounts for parentheses. Parentheses can't just be stretched to any
                    // amount like the previous block because then they just start to look like really
                    // long straight lines. But parentheses CAN be stretched a little before they
                    // start looking weird. This block will stretch a parenthesis to a maximum of two
                    // times its normal height. If the desired height is any bigger than that, then
                    // only the middle, most vertical part of the parenthesis will stretch. This hap-
                    // pens in normal TeX too (it probably allows for stretching past two times, but
                    // then again it has special characters for that; all we have here is the one).
  
                    // This if condition basically checks if the height of the parenthesis exceeds 2.
                    // But since canvases round height and widths, it checks if there will be at least
                    // one pixel more than twice the height of the parenthesis. If `height' was 2.01
                    // for example, and the height of the canvas was only like 5px, then `height' is
                    // greater than 2, but when it goes to be rendered, it ends up being rounded off
                    // to just the height of 2.
                    if (Math.floor(Math.floor(scale / 2 * height) - scale) <= 0) {
                      // If the height is less than 2, the character can be drawn normally and then
                      // just stretched. The code below is copied from above.
  
                      svgHeight = scale * height * dpr;
                      svgWidth = visibleWidth / totalGlyphHeight * scale * dpr;
                      svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
                      svg.innerHTML = `
                      <text
                        fill="currentColor"
                        transform="matrix(1,0,0,${svgHeight / (totalGlyphHeight * scale * dpr)},0,0)"
                        mask="url(#mask-${uuid}-1)"
                        y="${(1 - depth / totalGlyphHeight) * scale * dpr}"
                        x="${leftOffset * scale * dpr}"
                        font-size="${scale / totalGlyphHeight * dpr}"
                      >${delimiter}</text>
                      `
                      token.div.insertBefore(svg, leftSide ? token.div.firstElementChild : null);
                    } else {
                      // If the desired height is greater than two times its normal height, extra
                      // steps are necessary to get to its desired height without making it look
                      // weird.
  
                      // To begin, two characters need to be drawn. One will be used for the bottom of
                      // the parenthesis, the other for the top. We need to keep them separate though.
                      // Consider an example where the height is only off by 1px. If we just draw both
                      // characters (one at the top of the canvas, the other at the bottom) and clear
                      // the rectangle between their two halves, only one row of pixels will actually
                      // be cleared. That's a problem because the top character will also be visible
                      // in the bottom character's space because they're too close together. To pre-
                      // vent that, the bottom is drawn first (only the bottom half), copied in an
                      // `ImageData`, then deleted from the canvas. Then the top is drawn and cropped
                      // (so only the top half remains). Now, since the bottom half of the canvas has
                      // been cleared, the copy of the bottom half of the character can be pasted.
                      // Now, even though the two would normally overlap, they don't because they were
                      // drawn separately.
  
                      svgHeight = scale * height * dpr;
                      svgWidth = visibleWidth / totalGlyphHeight * scale * dpr;
                      svg.setAttribute("viewBox", `0 0 ${svgWidth} ${svgHeight}`);
                      let fontsize = scale / totalGlyphHeight * dpr;
  
                      const midScaleFactor = (svgHeight - (totalGlyphHeight * fontsize - stretchSize) * 2) / stretchSize;
  
                      svg.innerHTML = `
                        <mask id="mask-${uuid}-1">
                          <rect
                            fill="white"
                            x="0"
                            y="${depth * fontsize - totalGlyphHeight * fontsize}"
                            width="${svgWidth}"
                            height="${(totalGlyphHeight * fontsize - stretchSize) / 2}"
                          />
                        </mask>
                        <mask id="mask-${uuid}-2">
                          <rect
                            fill="white"
                            x="0"
                            y="${depth * fontsize - totalGlyphHeight * fontsize / 2 + stretchSize / 2}"
                            width="${svgWidth}"
                            height="${(totalGlyphHeight * fontsize - stretchSize) / 2}"
                          />
                        </mask>
                        <mask id="mask-${uuid}-3">
                          <rect
                            fill="white"
                            x="0"
                            y="${depth * fontsize - totalGlyphHeight * scale * dpr / 2 - stretchSize / 2}"
                            width="${svgWidth}"
                            height="${stretchSize}"
                          />
                        </mask>
                        <!-- ${totalGlyphHeight} ${scale} -->
                        <text
                          fill="currentColor"
                          transform="matrix(1,0,0,2,0,${2 * _height * fontsize})"
                          mask="url(#mask-${uuid}-1)"
                          y="0"
                          x="${leftOffset * scale * dpr}"
                          font-size="${fontsize}"
                        >${delimiter}</text>
                        <text
                          fill="currentColor"
                          transform="matrix(1,0,0,2,0,${svgHeight - 2 * baseline * fontsize})"
                          mask="url(#mask-${uuid}-2)"
                          y="0"
                          x="${leftOffset * scale * dpr}"
                          font-size="${fontsize}"
                        >${delimiter}</text>
                        <text
                          fill="currentColor"
                          transform="matrix(1,0,0,${midScaleFactor},0,${svgHeight - midScaleFactor * baseline * fontsize})"
                          mask="url(#mask-${uuid}-3)"
                          y="0"
                          x="${leftOffset * scale * dpr}"
                          font-size="${scale / totalGlyphHeight * dpr}"
                        >${delimiter}</text>
                      `;
  
                      token.div.insertBefore(svg, leftSide ? token.div.firstElementChild : null);
                      break;
  
                      img.height = canvas.height = scale * height * dpr;
  
                      // Get the <canvas>'s context for future drawing.
                      context = canvas.getContext("2d");
                      context.fillStyle = cssDeclaration.color;
  
                      context.font = `${scale / totalGlyphHeight * dpr}px ${family}`;
  
                      // Draw the entire glyph (since we can't draw just one half of it).
                      context.fillText(
                        delimiter,
                        Math.round(leftOffset * scale * dpr),
                        (1 / 2 - depth / totalGlyphHeight) * scale * dpr
                      );
  
                      // Now that the bottom half of the first glyph has been drawn, an `ImageData'
                      // saves the pixels so they can be put on the canvas later.
                      bottomHalf = context.getImageData(0, 0, canvas.width, scale / 2 * dpr);
                      // Clear the entire thing to get the top half.
                      context.clearRect(0, 0, canvas.width, canvas.height);
                      context.fillText(
                        delimiter,
                        Math.round(leftOffset * scale * dpr),
                        (1 - depth / totalGlyphHeight) * scale * dpr
                      );
  
                      // Clear the bottom half (leaving only the top half).
                      context.clearRect(0, scale / 2 * dpr, canvas.width, canvas.height);
  
                      // Now paste the bottom half from earlier.
                      context.putImageData(bottomHalf, 0, canvas.height - scale / 2 * dpr);
  
                      // All that's left to do is to connect them. To do that, a new `ImageData' in-
                      // stance is made where we can manipulate individual pixels. It will have the
                      // height of empty region of the canvas (the space between the two halves). For
                      // the top half of the `ImageData', the bottommost pixel of the top half charac-
                      // ter is copied and pasted over and over on top of each other, one row at a
                      // time. The same thing happens for the bottom half. It looks really inefficient
                      // below because it literally sets every single RGBA channel of every single
                      // pixel of every single row. Since an `ImageData's `data' attribute is readonly
                      // though: you can't make a new array and replace it, you have to change each
                      // individual value.
                      region = context.createImageData(canvas.width, canvas.height - scale * dpr);
                      topHalfRow = context.getImageData(0, scale / 2 * dpr - 1, canvas.width, 1).data;
                      bottomHalfRow = bottomHalf.data.slice(0, canvas.width * 4);
  
                      for (let i = 0, l = region.height / 2; i < l; i++) {
                        for (let n = 0, j = canvas.width; n < j; n++) {
                          let pixelOffset = i * canvas.width * 4 + n * 4;
                          region.data[pixelOffset + 0 /* red   */] = topHalfRow[n * 4 + 0];
                          region.data[pixelOffset + 1 /* green */] = topHalfRow[n * 4 + 1];
                          region.data[pixelOffset + 2 /* blue  */] = topHalfRow[n * 4 + 2];
                          region.data[pixelOffset + 3 /* alpha */] = topHalfRow[n * 4 + 3];
  
                          pixelOffset = ~~(i + region.height / 2) * canvas.width * 4 + n * 4;
                          region.data[pixelOffset + 0] = bottomHalfRow[n * 4 + 0];
                          region.data[pixelOffset + 1] = bottomHalfRow[n * 4 + 1];
                          region.data[pixelOffset + 2] = bottomHalfRow[n * 4 + 2];
                          region.data[pixelOffset + 3] = bottomHalfRow[n * 4 + 3];
                        }
                      }
  
                      // Place the filled section.
                      context.putImageData(region, 0, scale / 2 * dpr);
  
                      img.src = canvas.toDataURL("image/png", 1);
  
                      token.div.insertBefore(img, leftSide ? token.div.firstElementChild : null);
                    }
                    break;
  
                  case '[':
                  case ']':
                  case '⟮':
                  case '⟯':
                  case '↑':
                  case '↓':
                  case '↕':
                  case '⇑':
                  case '⇓':
                  case '⇕':
                  case '⌈':
                  case '⌉':
                  case '⌊':
                  case '⌋':
                  case '⎰':
                  case '⎱':
                    // These characters expand at the middle similar to how the parentheses do. The
                    // only difference is that they don't try to stretch to twice their height first.
                    // The code below is coped from the parenthesis case above.
  
                    img.height = canvas.height = scale * height * dpr;
  
                    // Get the <canvas>'s context for future drawing.
                    context = canvas.getContext("2d");
                    context.fillStyle = cssDeclaration.color;
                    
                    context.font = `${scale / totalGlyphHeight * dpr}px ${family}`;
  
                    context.fillText(
                      delimiter,
                      Math.round(leftOffset * scale * dpr),
                      (1 / 2 - depth / totalGlyphHeight) * scale * dpr
                    );
                    bottomHalf = context.getImageData(0, 0, canvas.width, scale / 2 * dpr);
                    context.clearRect(0, 0, canvas.width, canvas.height);
                    context.fillText(
                      delimiter,
                      Math.round(leftOffset * scale * dpr),
                      (1 - depth / totalGlyphHeight) * scale * dpr
                    );
                    context.clearRect(0, scale / 2 * dpr, canvas.width, canvas.height);
                    context.putImageData(bottomHalf, 0, canvas.height - scale / 2 * dpr);
                    // This if block is new. It checks if the region in between is 0 pixels tall and
                    // skips over connecting the regions if it is (since nothing would be drawn).
                    if (canvas.height > scale) {
                      region = context.createImageData(canvas.width, canvas.height - scale * dpr);
                      topHalfRow = context.getImageData(0, scale / 2 * dpr - 1, canvas.width, 1).data;
                      bottomHalfRow = bottomHalf.data.slice(0, canvas.width * 4);
  
                      for (let i = 0, l = region.height / 2; i < l; i++) {
                        for (let n = 0, j = canvas.width; n < j; n++) {
                          let pixelOffset = i * canvas.width * 4 + n * 4;
                          region.data[pixelOffset + 0] = topHalfRow[n * 4 + 0];
                          region.data[pixelOffset + 1] = topHalfRow[n * 4 + 1];
                          region.data[pixelOffset + 2] = topHalfRow[n * 4 + 2];
                          region.data[pixelOffset + 3] = topHalfRow[n * 4 + 3];
  
                          pixelOffset = ~~(i + region.height / 2) * canvas.width * 4 + n * 4;
                          region.data[pixelOffset + 0] = bottomHalfRow[n * 4 + 0];
                          region.data[pixelOffset + 1] = bottomHalfRow[n * 4 + 1];
                          region.data[pixelOffset + 2] = bottomHalfRow[n * 4 + 2];
                          region.data[pixelOffset + 3] = bottomHalfRow[n * 4 + 3];
                        }
                      }
                      context.putImageData(region, 0, scale / 2 * dpr);
                    }
  
                    img.src = canvas.toDataURL("image/png", 1);
  
                    token.div.insertBefore(img, leftSide ? token.div.firstElementChild : null);
                    break;
  
                  case '{':
                  case '}':
                    // Curly braces are expanded in two places compared to other delimiters: once at
                    // one third quarter up and the other at two thirds (between the things sticking
                    // out on the side). It works for most fonts, but it might still look kind of
                    // weird for others. There's no way to know for sure where to cut up the character
                    // other than analyzing individual pixels, which would be a lot of work for such a
                    // tiny edge case that I've never encountered myself.
  
                    img.height = canvas.height = scale * height * dpr;
  
                    // Get the <canvas>'s context for future drawing.
                    context = canvas.getContext("2d");
                    context.fillStyle = cssDeclaration.color;
  
                    context.font = `${scale / totalGlyphHeight * dpr}px ${family}`;
  
                    // Draw the bottom portion and save it.
                    context.fillText(
                      delimiter,
                      Math.round(leftOffset * scale * dpr),
                      (1 / 3 - depth / totalGlyphHeight) * scale * dpr
                    );
                    bottomHalf = context.getImageData(0, 0, canvas.width, scale / 3 * dpr);
                    context.clearRect(0, 0, canvas.width, canvas.height);
  
                    // Now draw the top half and save it as well since we need to draw a third, mid-
                    // dle portion still
                    context.fillText(
                      delimiter,
                      Math.round(leftOffset * scale * dpr),
                      (1 - depth / totalGlyphHeight) * scale * dpr
                    );
                    topHalf = context.getImageData(0, 0, canvas.width, scale / 3 * dpr);
                    context.clearRect(0, 0, canvas.width, canvas.height);
  
                    // Now we can draw the middle portion, and erase above and below it.
                    context.fillText(
                      delimiter,
                      Math.round(leftOffset * scale * dpr),
                      (1 / 2 - depth / totalGlyphHeight) * scale * dpr + canvas.height / 2
                    );
                    // Clear top half.
                    context.clearRect(
                      0,
                      0,
                      canvas.width,
                      Math.floor(canvas.height / 2 - scale / 6 * dpr)
                    );
                    // Clear bottom half.
                    context.clearRect(
                      0,
                      Math.ceil(canvas.height / 2 + scale / 6 * dpr),
                      canvas.width,
                      canvas.height
                    );
  
                    // Place the top and bottom portions now.
                    context.putImageData(topHalf, 0, 0);
                    context.putImageData(bottomHalf, 0, canvas.height - scale / 3 * dpr);
  
                    // All that's left is to connect them.
                    if (canvas.height > scale) {
                      // Draw the top connection first.
                      region = context.createImageData(
                        canvas.width,
                        (canvas.height - scale * dpr) / 2
                      );
                      topHalfRow = topHalf.data.slice(topHalf.data.length - canvas.width * 4);
                      bottomHalfRow = context.getImageData(
                        0,
                        Math.floor(canvas.height / 2 - scale / 6 * dpr),
                        canvas.width,
                        1
                      ).data;
  
                      for (let i = 0, l = region.height / 2; i < l; i++) {
                        for (let n = 0, j = canvas.width; n < j; n++) {
                          let pixelOffset = i * canvas.width * 4 + n * 4;
                          region.data[pixelOffset + 0] = topHalfRow[n * 4 + 0];
                          region.data[pixelOffset + 1] = topHalfRow[n * 4 + 1];
                          region.data[pixelOffset + 2] = topHalfRow[n * 4 + 2];
                          region.data[pixelOffset + 3] = topHalfRow[n * 4 + 3];
  
                          pixelOffset = ~~(i + region.height / 2) * canvas.width * 4 + n * 4;
                          region.data[pixelOffset + 0] = bottomHalfRow[n * 4 + 0];
                          region.data[pixelOffset + 1] = bottomHalfRow[n * 4 + 1];
                          region.data[pixelOffset + 2] = bottomHalfRow[n * 4 + 2];
                          region.data[pixelOffset + 3] = bottomHalfRow[n * 4 + 3];
                        }
                      }
                      context.putImageData(region, 0, scale / 3 * dpr);
  
                      // Now drop the bottom connection.
                      region = context.createImageData(canvas.width, (canvas.height - scale * dpr) / 2);
                      topHalfRow = context.getImageData(
                        0,
                        Math.ceil(canvas.height / 2 + scale / 6 * dpr) - 1,
                        canvas.width,
                        1
                      ).data;
                      bottomHalfRow = bottomHalf.data.slice(0, canvas.width * 4);
  
                      for (let i = 0, l = region.height / 2; i < l; i++) {
                        for (let n = 0, j = canvas.width; n < j; n++) {
                          let pixelOffset = i * canvas.width * 4 + n * 4;
                          region.data[pixelOffset + 0] = topHalfRow[n * 4 + 0];
                          region.data[pixelOffset + 1] = topHalfRow[n * 4 + 1];
                          region.data[pixelOffset + 2] = topHalfRow[n * 4 + 2];
                          region.data[pixelOffset + 3] = topHalfRow[n * 4 + 3];
  
                          pixelOffset = ~~(i + region.height / 2) * canvas.width * 4 + n * 4;
                          region.data[pixelOffset + 0] = bottomHalfRow[n * 4 + 0];
                          region.data[pixelOffset + 1] = bottomHalfRow[n * 4 + 1];
                          region.data[pixelOffset + 2] = bottomHalfRow[n * 4 + 2];
                          region.data[pixelOffset + 3] = bottomHalfRow[n * 4 + 3];
                        }
                      }
                      context.putImageData(region, 0, Math.ceil(canvas.height / 2 + scale / 6 * dpr));
                    }
  
                    img.src = canvas.toDataURL("image/png", 1);
  
                    token.div.insertBefore(img, leftSide ? token.div.firstElementChild : null);
                    break;
                }
              }
              
              // Handle the left delimiter first.
              if (token.delims[0] == ".") {
                // If the delimiter is a "." (i.e., not a visible character), we add a kern instead
                // of drawing a <canvas> picture.
                items.splice(items.length - 1, 0, {
                  type: "kern",
                  dimen: token.nullDelimiterSpace
                });
              } else {
                // Otherwise we need to draw it out.
                // Brackets are actually just synonymous with their extended version.
                if (token.delims[0] == '>') token.delims[0] = '⟩';
                if (token.delims[0] == '<') token.delims[0] = '⟨';
                drawDelim(token.delims[0], true, fontSize);
              }
  
              // Do the same thing for the right delimiter now.
              if (token.delims[1] == ".") {
                items.splice(items.length, 0, {
                  type: "kern",
                  dimen: token.nullDelimiterSpace
                });
              } else {
                if (token.delims[1] == '>') token.delims[1] = '⟩';
                if (token.delims[1] == '<') token.delims[1] = '⟨';
                drawDelim(token.delims[1], false, fontSize);
              }
            }
  
            // Now that the nucleus of the atom is done, only the sub/superscripts need to be created.
            // After that, the atom is done being rendered. Here is where the scripts are made. 
            if (token.superscript || token.subscript) {
              // If this is an Op atom with limits, handle those kinds of scripts first.
              if (token.atomType == atomTypes.OP && token.limits) {
                // Op atoms with limits are positioned similarly to fractions, with the first and
                // second thinnest components being rendered first and the thickest last.
  
                let nucleusElem = token.div.firstElementChild;
                container.appendChild(token.div);
                let nucleusWidth = token.div.offsetWidth + 1;
                container.removeChild(token.div);
  
                // If there's only a subscript with no superscript, render it like a fraction.
                if (token.subscript && !token.superscript) {
                  token.div.renderedDepth = Math.max(token.div.renderedDepth, 0)
  
                  let sub = document.createElement("div");
                  sub.style.display = "inline-block";
                  sub.style.verticalAlign = "text-bottom";
                  sub.style.position = "relative";
  
                  let heightOffset = document.createElement("div");
                  heightOffset.innerText = "\u00A0";
                  heightOffset.style.verticalAlign = "text-top";
                  heightOffset.style.display = "inline-block";
                  heightOffset.style.width = 0;
  
                  newBox(
                    token.subscript,
                    style == "display" || style == "text" ? "script" : "scriptscript",
                    true,
                    font,
                    sub
                  );
  
                  sub.style.fontSize = style == "scriptscript" ?
                      token.div.style.fontSize :
                      `calc(${token.div.style.fontSize} * ${rootHalf})`;
                  container.appendChild(sub);
                  let width = sub.offsetWidth + 1;
                  sub.style.fontSize = "50px";
                  let height = sub.offsetHeight / 50;
                  container.removeChild(sub);
  
                  if (style == "scriptscript") {
                    sub.style.fontSize = "";
                    // The baselineHeight of a font family is how much space is between the baseline
                    // and the bottom of the character's box. Taking away a character's depth from that
                    // amount leaves only how much empty space there is below a character (a "y" for
                    // example has less empty space below it than an "a" because the descender from the
                    // "y" gives "y" a greater depth). This is what lets a subscript appear higher on
                    // an "a" than on a "y" (try "\mathop y_1 \mathop a_1" to see the difference on the
                    // "1").
                    sub.style.top =
                        `${-sub.baseline - sub.baselineOffset - token.div.renderedDepth}em`;
                    heightOffset.style.paddingBottom =
                      `${height - token.div.baseline + token.div.baselineOffset +
                        token.div.renderedDepth}em`;
                  } else {
                    sub.style.fontSize = rootHalfEm;
                    sub.style.top = (-token.div.baseline - token.div.baselineOffset + token.div.renderedDepth) / rootHalf + 'em';
                    heightOffset.style.paddingBottom = height * rootHalf - token.div.baseline - token.div.baselineOffset + token.div.renderedDepth + 'em';
                  }
  
                  sub.style.height = 0;
  
                  // This is where the nucleus and subscript are positioned depending on their width.
                  let thinner;
                  let thicker;
                  if (width < nucleusWidth) {
                    thinner = sub.firstElementChild;
                    thicker = nucleusElem;
                    token.div.insertBefore(sub, nucleusElem);
                    sub.style.width = 0;
                  } else {
                    thinner = nucleusElem;
                    thicker = sub.firstElementChild;
                    token.div.appendChild(sub);
                  }
  
                  let thinContainer = document.createElement("div");
                  thinContainer.style.display = "inline-block";
                  thinContainer.style.position = "relative";
  
                  let heightContainer = document.createElement("div");
                  heightContainer.style.display = "inline-block";
                  heightContainer.style.width = 0;
                  heightContainer.style.visibility = "hidden";
                  heightContainer.style.webkitUserSelect =
                      heightContainer.style.mozUserSelect =
                      heightContainer.style.msUserSelect =
                      heightContainer.style.userSelect = "none";
                  heightContainer.appendChild(noWrap(thinner.cloneNode(true)));
                  thinContainer.appendChild(heightContainer);
  
                  let widthCont = document.createElement("div");
                  widthCont.style.position = "absolute";
                  widthCont.style.left = widthCont.style.right = 0;
                  widthCont.style.textAlign = "center";
                  widthCont.style.display = "inline-block";
                  widthCont.appendChild(thinner);
                  thinContainer.appendChild(widthCont);
  
                  thinContainer.style.width =
                      `${Math.max(width, nucleusWidth) / fontSize / (style != "scriptscript" &&
                        thicker == nucleusElem ? rootHalf : 1)}em`;
  
                  if (width < nucleusWidth) {
                    sub.appendChild(thinContainer);
                  } else {
                    let nucleusPar = document.createElement("div");
                    nucleusPar.style.display = "inline-block";
                    nucleusPar.style.width = 0;
                    nucleusPar.appendChild(thinContainer);
                    token.div.insertBefore(nucleusPar, sub);
                  }
  
                  token.div.insertBefore(heightOffset, token.div.firstElementChild);
  
                  // Since the subscript in its entirety is being added on right under the atom, all
                  // of its height and depth are added on to the depth of the atom.
                  token.div.renderedDepth +=
                      (height * (style == "scriptscript" ? 1 : rootHalf) - sub.baseline -
                        sub.baselineOffset + sub.renderedDepth) * multiplier;
                } else if (token.superscript && !token.subscript) {
                  // This is the superscript version of the above.
                  let sup = document.createElement("div");
                  sup.style.display = "inline-block";
                  sup.style.verticalAlign = "text-bottom";
                  newBox(
                    token.superscript,
                    style == "display" || style == "text" ? "script" : "scriptscript",
                    cramped,
                    font,
                    sup
                  );
  
                  sup.style.fontSize =
                      style == "scriptscript" ?
                        token.div.style.fontSize :
                        `calc(${token.div.style.fontSize} * ${rootHalf})`;
                  container.appendChild(sup);
                  let width = sup.offsetWidth + 1;
                  sup.style.fontSize = "50px";
                  let height = sup.offsetHeight / 50;
                  container.removeChild(sup);
  
                  if (style == "scriptscript") {
                    sup.style.fontSize = "";
                    sup.style.marginBottom = `${
                      token.div.baseline + token.div.baselineOffset + token.div.renderedHeight
                    }em`;
                  } else {
                    sup.style.fontSize = rootHalfEm;
                    sup.style.marginBottom =
                        `${(token.div.baseline + token.div.baselineOffset +
                          token.div.renderedHeight) / rootHalf}em`;
                  }
  
                  let thinner;
                  let thicker;
                  if (width < nucleusWidth) {
                    thinner = sup.firstElementChild;
                    thicker = nucleusElem;
                    token.div.insertBefore(sup, nucleusElem);
                    sup.style.width = 0;
                  } else {
                    thinner = nucleusElem;
                    thicker = sup.firstElementChild;
                    token.div.appendChild(sup);
                  }
  
                  let thinContainer = document.createElement("div");
                  thinContainer.style.display = "inline-block";
                  thinContainer.style.position = "relative";
  
                  let heightContainer = document.createElement("div");
                  heightContainer.style.display = "inline-block";
                  heightContainer.style.width = 0;
                  heightContainer.style.visibility = "hidden";
                  heightContainer.style.webkitUserSelect =
                    heightContainer.style.mozUserSelect =
                    heightContainer.style.msUserSelect =
                    heightContainer.style.userSelect = "none";
                  heightContainer.appendChild(noWrap(thinner.cloneNode(true)));
                  thinContainer.appendChild(heightContainer);
  
                  let widthCont = document.createElement("div");
                  widthCont.style.position = "absolute";
                  widthCont.style.left = widthCont.style.right = 0;
                  widthCont.style.textAlign = "center";
                  widthCont.style.display = "inline-block";
                  widthCont.appendChild(thinner);
                  thinContainer.appendChild(widthCont);
                  thinContainer.style.width =
                      `${Math.max(width, nucleusWidth) / fontSize / (style != "scriptscript" &&
                        thicker == nucleusElem ? rootHalf : 1)}em`;
  
                  if (width < nucleusWidth) {
                    sup.appendChild(thinContainer);
                  } else {
                    let nucleusPar = document.createElement("div");
                    nucleusPar.style.display = "inline-block";
                    nucleusPar.style.width = 0;
                    nucleusPar.appendChild(thinContainer);
                    token.div.insertBefore(nucleusPar, sup);
                  }
  
                  token.div.renderedHeight +=
                      (sup.baseline + sup.baselineOffset + sup.renderedHeight) *
                      (style == "scriptscript" ? 1 : rootHalf) * multiplier;
                } else if (token.superscript && token.subscript) {
                  // Both a superscript and subscript are rendered the same way they are separately.
                  // The only difference is that three things' widths are compared instead of just
                  // two.
  
                  token.div.renderedDepth = Math.max(token.div.renderedDepth, 0);
  
                  let sub = document.createElement("div");
                  sub.style.display = "inline-block";
                  sub.style.verticalAlign = "text-bottom";
                  sub.style.position = "relative";
                  newBox(
                    token.subscript,
                    style == "display" || style == "text" ? "script" : "scriptscript",
                    true,
                    font,
                    sub
                  );
  
                  sub.style.fontSize =
                      style == "scriptscript" ?
                        token.div.style.fontSize :
                        `calc(${token.div.style.fontSize} * ${rootHalf})`;
                  container.appendChild(sub);
                  let subWidth = sub.offsetWidth + 1;
                  sub.style.fontSize = "50px";
                  let subHeight = sub.offsetHeight / 50;
                  container.removeChild(sub);
  
                  let sup = document.createElement("div");
                  sup.style.display = "inline-block";
                  sup.style.verticalAlign = "text-bottom";
                  sup.style.position = "relative";
                  newBox(
                    token.superscript,
                    style == "display" || style == "text" ? "script" : "scriptscript",
                    cramped,
                    font,
                    sup
                  );
  
                  sup.style.fontSize =
                      style == "scriptscript" ?
                        token.div.style.fontSize :
                        `calc(${token.div.style.fontSize} * ${rootHalf})`;
                  container.appendChild(sup);
                  let supWidth = sup.offsetWidth + 1;
                  sup.style.fontSize = "50px";
                  let supHeight = sup.offsetHeight / 50;
                  container.removeChild(sup);
  
                  let heightOffset = document.createElement("div");
                  heightOffset.innerText = "\u00A0";
                  heightOffset.style.verticalAlign = "text-top";
                  heightOffset.style.display = "inline-block";
                  heightOffset.style.width = 0;
  
                  if (style == "scriptscript") {
                    sub.style.fontSize = sup.style.fontSize = "";
                    sub.style.top =
                        `${-sub.baseline - sub.baselineOffset - token.div.renderedDepth}em`;
                    heightOffset.style.paddingBottom =
                        `${height - token.div.baseline + token.div.baselineOffset +
                          token.div.renderedDepth}em`;
                    sup.style.marginBottom =
                        `${token.div.baseline + token.div.baselineOffset +
                          token.div.renderedHeight}em`;
                  } else {
                    sub.style.fontSize = sup.style.fontSize = rootHalfEm;
                    sub.style.top =
                        `${(-token.div.baseline - token.div.baselineOffset + token.div.renderedDepth)
                          / rootHalf}em`;
                    heightOffset.style.paddingBottom =
                        `${subHeight * rootHalf - token.div.baseline + token.div.baselineOffset +
                          token.div.renderedDepth}em`;
                    sup.style.marginBottom =
                        `${(token.div.baseline + token.div.baselineOffset +
                          token.div.renderedHeight) / rootHalf}em`;
                  }
                  sub.style.height = 0;
  
                  if (subWidth <= supWidth && nucleusWidth <= supWidth) {
                    token.div.insertBefore(sub, nucleusElem);
                    token.div.appendChild(sup);
                    sub.style.width = 0;
  
                    let subThinContainer = document.createElement("div");
                    let nucThinContainer = document.createElement("div");
                    subThinContainer.style.display =
                        nucThinContainer.style.display = "inline-block";
                    subThinContainer.style.position =
                        nucThinContainer.style.position = "relative";
  
                    let subHeightContainer = document.createElement("div");
                    let nucHeightContainer = document.createElement("div");
                    subHeightContainer.style.display =
                        nucHeightContainer.style.display = "inline-block";
                    subHeightContainer.style.width =
                        nucHeightContainer.style.width = 0;
                    subHeightContainer.style.visibility =
                        nucHeightContainer.style.visibility = "hidden";
                    subHeightContainer.style.webkitUserSelect =
                        subHeightContainer.style.mozUserSelect =
                        subHeightContainer.style.msUserSelect =
                        subHeightContainer.style.userSelect =
                        nucHeightContainer.style.webkitUserSelect =
                        nucHeightContainer.style.mozUserSelect =
                        nucHeightContainer.style.msUserSelect =
                        nucHeightContainer.style.userSelect = "none";
                    subHeightContainer.appendChild(noWrap(sub.firstElementChild.cloneNode(true)));
                    nucHeightContainer.appendChild(noWrap(nucleusElem.cloneNode(true)));
                    subThinContainer.appendChild(subHeightContainer);
                    nucThinContainer.appendChild(nucHeightContainer);
  
                    let subWidthCont = document.createElement("div");
                    let nucWidthCont = document.createElement("div");
                    subWidthCont.style.position =
                        nucWidthCont.style.position = "absolute";
                    subWidthCont.style.left =
                        subWidthCont.style.right = 0;
                    nucWidthCont.style.left =
                        nucWidthCont.style.right = 0;
                    subWidthCont.style.textAlign =
                        nucWidthCont.style.textAlign = "center";
                    subWidthCont.style.display =
                        nucWidthCont.style.display = "inline-block";
                    subWidthCont.appendChild(sub.firstElementChild);
                    nucWidthCont.appendChild(nucleusElem);
                    subThinContainer.appendChild(subWidthCont);
                    nucThinContainer.appendChild(nucWidthCont);
  
                    subThinContainer.style.width =
                        `${supWidth / fontSize / (style != "scriptscript" ? rootHalf : 1)}em`;
                    nucThinContainer.style.width = `${supWidth / fontSize}em`;
                    sub.appendChild(subThinContainer);
  
                    let nucleusPar = document.createElement("div");
                    nucleusPar.style.display = "inline-block";
                    nucleusPar.style.width = 0;
                    nucleusPar.appendChild(nucThinContainer);
                    token.div.insertBefore(nucleusPar, sup);
                  } else if (subWidth <= nucleusWidth && supWidth <= nucleusWidth) {
                    token.div.insertBefore(sub, nucleusElem);
                    token.div.insertBefore(sup, nucleusElem);
                    sub.style.width = sup.style.width = 0;
  
                    let subThinContainer = document.createElement("div");
                    let supThinContainer = document.createElement("div");
                    subThinContainer.style.display =
                        supThinContainer.style.display = "inline-block";
                    subThinContainer.style.position =
                        supThinContainer.style.position = "relative";
  
                    let subHeightContainer = document.createElement("div");
                    let supHeightContainer = document.createElement("div");
                    subHeightContainer.style.display =
                        supHeightContainer.style.display = "inline-block";
                    subHeightContainer.style.width =
                        supHeightContainer.style.width = 0;
                    subHeightContainer.style.visibility =
                        supHeightContainer.style.visibility = "hidden";
                    subHeightContainer.style.webkitUserSelect =
                        subHeightContainer.style.mozUserSelect =
                        subHeightContainer.style.msUserSelect =
                        subHeightContainer.style.userSelect =
                        supHeightContainer.style.webkitUserSelect =
                        supHeightContainer.style.mozUserSelect =
                        supHeightContainer.style.msUserSelect =
                        supHeightContainer.style.userSelect = "none";
                    subHeightContainer.appendChild(noWrap(sub.firstElementChild.cloneNode(true)));
                    supHeightContainer.appendChild(noWrap(sup.firstElementChild.cloneNode(true)));
                    subThinContainer.appendChild(subHeightContainer);
                    supThinContainer.appendChild(supHeightContainer);
  
                    let subWidthCont = document.createElement("div");
                    let supWidthCont = document.createElement("div");
                    subWidthCont.style.position =
                        supWidthCont.style.position = "absolute";
                    subWidthCont.style.left =
                        subWidthCont.style.right = 0;
                    supWidthCont.style.left =
                        supWidthCont.style.right = 0;
                    subWidthCont.style.textAlign =
                        supWidthCont.style.textAlign = "center";
                    subWidthCont.style.display =
                        supWidthCont.style.display = "inline-block";
                    subWidthCont.appendChild(sub.firstElementChild);
                    supWidthCont.appendChild(sup.firstElementChild);
                    subThinContainer.appendChild(subWidthCont);
                    supThinContainer.appendChild(supWidthCont);
                    subThinContainer.style.width =
                        `${nucleusWidth / fontSize / (style != 'scriptscript' ? rootHalf : 1)}em`;
                    supThinContainer.style.width =
                        `${nucleusWidth / fontSize / (style != 'scriptscript' ? rootHalf : 1)}em`;
                    sub.appendChild(subThinContainer);
                    sup.appendChild(supThinContainer);
                  } else if (nucleusWidth <= subWidth && supWidth <= subWidth) {
                    token.div.insertBefore(sup, nucleusElem);
                    token.div.appendChild(sub);
                    sup.style.width = 0;
  
                    let supThinContainer = document.createElement("div");
                    let nucThinContainer = document.createElement("div");
                    supThinContainer.style.display = nucThinContainer.style.display = "inline-block";
                    supThinContainer.style.position = nucThinContainer.style.position = "relative";
  
                    let supHeightContainer = document.createElement("div");
                    let nucHeightContainer = document.createElement("div");
                    supHeightContainer.style.display =
                        nucHeightContainer.style.display = "inline-block";
                    supHeightContainer.style.width =
                        nucHeightContainer.style.width = 0;
                    supHeightContainer.style.visibility =
                        nucHeightContainer.style.visibility = "hidden";
                    supHeightContainer.style.webkitUserSelect =
                      supHeightContainer.style.mozUserSelect =
                      supHeightContainer.style.msUserSelect =
                      supHeightContainer.style.userSelect =
                      nucHeightContainer.style.webkitUserSelect =
                      nucHeightContainer.style.mozUserSelect =
                      nucHeightContainer.style.msUserSelect =
                      nucHeightContainer.style.userSelect = "none";
                    supHeightContainer.appendChild(noWrap(sup.firstElementChild.cloneNode(true)));
                    nucHeightContainer.appendChild(noWrap(nucleusElem.cloneNode(true)));
                    supThinContainer.appendChild(supHeightContainer);
                    nucThinContainer.appendChild(nucHeightContainer);
  
                    let supWidthCont = document.createElement("div");
                    let nucWidthCont = document.createElement("div");
                    supWidthCont.style.position =
                        nucWidthCont.style.position = "absolute";
                    supWidthCont.style.left =
                        supWidthCont.style.right = 0;
                    nucWidthCont.style.left =
                        nucWidthCont.style.right = 0;
                    supWidthCont.style.textAlign =
                        nucWidthCont.style.textAlign = "center";
                    supWidthCont.style.display =
                        nucWidthCont.style.display = "inline-block";
                    supWidthCont.appendChild(sup.firstElementChild);
                    nucWidthCont.appendChild(nucleusElem);
                    supThinContainer.appendChild(supWidthCont);
                    nucThinContainer.appendChild(nucWidthCont);
                    supThinContainer.style.width =
                        `${subWidth / fontSize / (style != 'scriptscript' ? rootHalf : 1)}em`;
                    nucThinContainer.style.width = `${subWidth / fontSize}em`;
                    sup.appendChild(supThinContainer);
  
                    let nucleusPar = document.createElement("div");
                    nucleusPar.style.display = "inline-block";
                    nucleusPar.style.width = 0;
                    nucleusPar.appendChild(nucThinContainer);
                    token.div.insertBefore(nucleusPar, sub);
                  }
  
                  token.div.insertBefore(heightOffset, token.div.firstElementChild);
  
                  token.div.renderedDepth +=
                      (subHeight * (style == "scriptscript" ? 1 : rootHalf) - sub.baseline -
                        sub.baselineOffset + sub.renderedDepth) * multiplier;
                  token.div.renderedHeight +=
                      (sup.baseline + sup.baselineOffset + sup.renderedHeight) *
                      (style == "scriptscript" ? 1 : rootHalf) * multiplier;
                }
              } else {
                // An atom with a subscript and no superscript has the subscript rendered a little
                // higher.
                if (token.subscript && !token.superscript) {
                  // `heightOffset' is used to offset the vertical spacing of any lines adjacent to
                  // the equation.
                  let sub = document.createElement("div");
                  sub.style.display = "inline-block";
                  sub.style.verticalAlign = "text-bottom";
                  sub.style.position = "relative";
  
                  let heightOffset = document.createElement("div");
                  heightOffset.style.verticalAlign = "text-top";
                  heightOffset.textContent = "\u00A0";
                  heightOffset.style.display = "inline-block";
                  heightOffset.style.width = 0;
                  newBox(
                    token.subscript,
                    style == "display" || style == "text" ? "script" : "scriptscript",
                    true,
                    font,
                    sub
                  );
  
                  sub.style.fontSize = "50px";
                  container.appendChild(sub);
                  let height = sub.offsetHeight / 50;
                  container.removeChild(sub);
  
                  // If the style isn't already at scriptscript, then it'll be rendered at a smaller
                  // font. There's a lot of numbers below with adding and subtracting and stuff, but
                  // basically, the subscript is moved up or down so that its baseline matches the
                  // baseline of the nucleus (since vertical-align: text-bottom moves it depending on
                  // the font size). Once the baselines are lined up, the script is moved down so
                  // that either its top is at 4/5 of the parent's ex height, or its bottom is 1/5
                  // below the nucleus's bottom, which ever is lower. That means the subscript will
                  // always be at least 4/5 below the ex height, but will also be moved down if the
                  // nucleus is extra tall. The 4/5 number was taken directly from TeX. TeX gets the
                  // 1/5 from fonts' parameters and can vary depending on the font. 1/5 just seems to
                  // be around the right area to fit most fonts.
                  if (style == "scriptscript") {
                    sub.style.fontSize = "";
                    sub.style.top =
                        `${Math.max(sub.baseline, sub.renderedDepth) -
                          fontDimen.baselineHeightOf(family) +
                          Math.max(
                            Math.max(token.div.renderedDepth, 0) / multiplier + .2,
                            sub.renderedHeight - fontDimen.heightOf("x", family)
                          ) - height
                        }em`;
                    heightOffset.style.paddingBottom =
                        `${Math.max(sub.baseline, sub.renderedDepth) -
                          fontDimen.baselineHeightOf(family) +
                          Math.max(
                            Math.max(token.div.renderedDepth, 0) / multiplier + .2,
                            sub.renderedHeight - fontDimen.heightOf("x", family)
                          ) - height
                        }em`;
                  } else {
                    sub.style.fontSize = rootHalfEm;
                    sub.style.top =
                        `${Math.max(sub.baseline, sub.renderedDepth) -
                          fontDimen.baselineHeightOf(family) / rootHalf +
                          Math.max(
                            Math.max(token.div.renderedDepth, 0) / multiplier / rootHalf + .2,
                            sub.renderedHeight - fontDimen.heightOf("x", family)
                          ) - height
                        }em`;
                    heightOffset.style.paddingBottom =
                        `${Math.max(sub.baseline, sub.renderedDepth) * rootHalf -
                          fontDimen.baselineHeightOf(family) +
                          Math.max(
                            Math.max(token.div.renderedDepth, 0) / multiplier / rootHalf + .2,
                            sub.renderedHeight - fontDimen.heightOf("x", family)
                          ) * rootHalf
                        }em`;
                    token.div.renderedDepth =
                        Math.max(
                          token.div.renderedDepth,
                          (sub.renderedDepth * rootHalf +
                            Math.max(
                              Math.max(token.div.renderedDepth, 0) / multiplier / rootHalf + .2,
                              sub.renderedHeight - fontDimen.heightOf("x", family)
                            ) * rootHalf
                          ) * multiplier
                        );
                  }
  
                  // If the subscript is taller than the nucleus (it can happen if there's like a
                  // fraction or a table in the script but not in the nucleus or if the script itself
                  // also has scripts), it can unintentionally offset the height of the line. To pre-
                  // vent that, its height is set to 0.
                  sub.style.height = 0;
                  token.div.appendChild(sub);
                  token.div.insertBefore(heightOffset, sub);
                } else if (token.superscript && !token.subscript) {
                  // Superscripts are rendered much the same way as subscripts. Instead of getting a
                  // `heightOffset' element, they get a padding-top that displaces elements around it
                  // instead.
                  let sup = document.createElement("div");
                  newBox(
                    token.superscript,
                    style == "display" || style == "text" ? "script" : "scriptscript",
                    cramped,
                    font,
                    sup
                  );
                  sup.style.display = "inline-block";
                  sup.style.verticalAlign = "text-bottom";
                  sup.style.position = "relative";
  
                  // The math here is almost the same as with subscripts. The script is moved to the
                  // baseline first. Then it's shifted up so that either the bottom is at 7/10 (3/5
                  // when in "cramped" mode) of the ex height, or the top is 1/5 (1/10 in "cramped"
                  // mode) above the height of the nucleus. It's always at least 3/5 above the ex
                  // height but can move up with the nucleus if the nucleus is particularly tall.
                  // "Cramped" mode is when the `cramped` argument is true and it basically just sig-
                  // nals that exponents need to be rendered lower.
                  if (style == "scriptscript") {
                    sup.style.top =
                        `${Math.max(sup.baseline, sup.renderedDepth) -
                          fontDimen.baselineHeightOf(family) -
                          Math.max(
                            token.div.renderedHeight / multiplier + (cramped ? .1 : .2) -
                              sup.renderedHeight,
                            sup.renderedDepth + (cramped ? .9 : 1) *
                              fontDimen.heightOf("x", family)
                          )
                        }em`;
                    sup.style.paddingTop =
                        `${
                          -Math.max(sup.baseline, sup.renderedDepth) +
                          fontDimen.baselineHeightOf(family) +
                          Math.max(
                            token.div.renderedHeight / multiplier + (cramped ? .1 : .2) -
                              sup.renderedHeight,
                            sup.renderedDepth + (cramped ? .9 : 1) *
                              fontDimen.heightOf("x", family))
                        }em`;
                    token.div.renderedHeight =
                        Math.max(
                          token.div.renderedHeight,
                          (sup.renderedHeight + Math.max(
                            token.div.renderedHeight / multiplier + (cramped ? .1 : .2) -
                              sup.renderedHeight,
                            sup.renderedDepth + (cramped ? .9 : 1) *
                              fontDimen.heightOf("x", family)
                            )
                          ) * multiplier
                        );
                  } else {
                    sup.style.fontSize = rootHalfEm;
                    sup.style.top =
                        `${Math.max(sup.baseline, sup.renderedDepth) -
                          fontDimen.baselineHeightOf(family) / rootHalf -
                          Math.max(
                            token.div.renderedHeight / multiplier / rootHalf + (cramped ? .1 : .2) -
                              sup.renderedHeight,
                            sup.renderedDepth + (cramped ? .9 : 1) *
                              fontDimen.heightOf("x", family)
                          )
                        }em`;
                    sup.style.paddingTop = `${
                      -Math.max(sup.baseline, sup.renderedDepth) +
                      fontDimen.baselineHeightOf(family) / rootHalf +
                      Math.max(
                        token.div.renderedHeight / multiplier / rootHalf + (cramped ? .1 : .2) -
                          sup.renderedHeight,
                        sup.renderedDepth + (cramped ? .9 : 1) *
                          fontDimen.heightOf("x", family)
                      )
                    }em`;
                    token.div.renderedHeight =
                        Math.max(
                          token.div.renderedHeight,
                          (sup.renderedHeight + Math.max(
                            token.div.renderedHeight / multiplier / rootHalf + (cramped ? .1 : .2) -
                              sup.renderedHeight,
                            sup.renderedDepth + (cramped ? .9 : 1) *
                              fontDimen.heightOf("x", family)
                          )) * rootHalf * multiplier
                        );
                  }
  
                  token.div.appendChild(sup);
                } else if (token.subscript && token.superscript) {
                  // If both a sub/superscript are found, the thinner is placed first with width: 0.
                  // Then the thicker one is placed with its normal width.
  
                  // First create the subscript without any styles applied yet. All the dimensions
                  // are also gotten from here.
                  let sub = document.createElement("div");
                  let heightOffset = document.createElement("div");
                  sub.style.display = "inline-block";
                  heightOffset.style.verticalAlign = "text-top";
                  heightOffset.innerText = "\u00A0";
                  heightOffset.style.display = "inline-block";
                  heightOffset.style.width = 0;
                  newBox(
                    token.subscript,
                    style == "display" || style == "text" ? "script" : "scriptscript",
                    true,
                    font,
                    sub
                  );
                  sub.style.fontSize = "50px";
                  container.appendChild(sub);
  
                  let subDimens = {height: sub.offsetHeight, width: sub.offsetWidth + 1};
                  container.removeChild(sub);
  
                  // Do the same for the superscript.
                  let sup = document.createElement("div");
                  sup.style.display = "inline-block";
                  newBox(
                    token.superscript,
                    style == "display" || style == "text" ? "script" : "scriptscript",
                    cramped,
                    font,
                    sup
                  );
                  sup.style.fontSize = "50px";
                  container.appendChild(sup);
  
                  let supDimens = {height: sup.offsetHeight, width: sup.offsetWidth + 1};
                  container.removeChild(sup);
  
                  // Assign variables to keep track of which of the scripts is thinner.
                  let thinner = supDimens.width + scriptOffset * fontSize > subDimens.width ? sub : sup;
                  let thicker = supDimens.width + scriptOffset * fontSize > subDimens.width ? sup : sub;
                  let height = supDimens.height / 50;
                  let depth = subDimens.height / 50;
  
                  // Add an offset to the superscript.
                  sup.style.marginLeft = `${scriptOffset}em`;
                  // Add a negative margin-right if the subscript is going to come after it, so that
                  // the subscript isn't shifted over by the same amount.
                  if (thinner == sup) {
                    sup.style.marginRight = `${-scriptOffset}em`;
                  }
  
                  // Now, all the styles are added like normal.
                  sub.style.verticalAlign =
                      sup.style.verticalAlign = "text-bottom";
                  sup.style.position =
                      sub.style.position = "relative";
  
                  let exHeight = fontDimen.heightOf("x", family);
                  if (style == "scriptscript") {
                    sub.style.fontSize =
                        sup.style.fontSize = "";
  
                    sup.style.top =
                        `${Math.max(sup.baseline, sup.renderedDepth) -
                          fontDimen.baselineHeightOf(family) -
                          Math.max(
                            token.div.renderedHeight / multiplier + (cramped ? .1 : .2) -
                              sup.renderedHeight,
                            sup.renderedDepth + (cramped ? .9 : 1) * exHeight
                          )
                        }em`;
                    sup.style.paddingTop =
                        `${-Math.max(sup.baseline, sup.renderedDepth) +
                          fontDimen.baselineHeightOf(family) +
                          Math.max(
                            token.div.renderedHeight / multiplier + (cramped ? .1 : .2) -
                              sup.renderedHeight,
                            sup.renderedDepth + (cramped ? .9 : 1) * exHeight
                          )
                        }em`;
                    token.div.renderedHeight =
                        Math.max(
                          token.div.renderedHeight,
                          (sup.renderedHeight + Math.max(
                            token.div.renderedHeight / multiplier + (cramped ? .1 : .2) -
                              sup.renderedHeight,
                            sup.renderedDepth + (cramped ? .9 : 1) * exHeight
                          )) * multiplier
                        );
  
                    sub.style.top =
                        `${Math.max(sub.baseline, sub.renderedDepth) -
                          fontDimen.baselineHeightOf(family) +
                          Math.max(
                            Math.max(token.div.renderedDepth, 0) / multiplier + .2,
                            sub.renderedHeight - .8 * exHeight
                          ) - depth
                        }em`;
                    heightOffset.style.paddingBottom =
                        `${Math.max(sub.baseline, sub.renderedDepth) -
                          fontDimen.baselineHeightOf(family) +
                          Math.max(
                            Math.max(token.div.renderedDepth, 0) / multiplier + .2,
                            sub.renderedHeight - .8 * exHeight
                          ) - height
                        }em`;
                    token.div.renderedDepth =
                        Math.max(
                          token.div.renderedDepth,
                          (sub.renderedDepth + Math.max(
                            Math.max(token.div.renderedDepth, 0) / multiplier + .2,
                            sub.renderedHeight - .8 * exHeight
                          )) * multiplier
                        );
                  } else {
                    sub.style.fontSize = sup.style.fontSize = rootHalfEm;
  
                    sup.style.top =
                        `${Math.max(sup.baseline, sup.renderedDepth) -
                          fontDimen.baselineHeightOf(family) / rootHalf -
                          Math.max(
                            token.div.renderedHeight / multiplier / rootHalf + (cramped ? .1 : .2) -
                              sup.renderedHeight,
                            sup.renderedDepth + (cramped ? .9 : 1) * exHeight
                          )
                        }em`;
                    sup.style.paddingTop =
                        `${-Math.max(sup.baseline, sup.renderedDepth) +
                          fontDimen.baselineHeightOf(family) / rootHalf +
                          Math.max(
                            token.div.renderedHeight / multiplier / rootHalf + (cramped ? .1 : .2) -
                              sup.renderedHeight,
                            sup.renderedDepth + (cramped ? .9 : 1) * exHeight
                          )
                        }em`;
                    token.div.renderedHeight = 
                        Math.max(
                          token.div.renderedHeight,
                          (sup.renderedHeight + Math.max(
                            token.div.renderedHeight / multiplier / rootHalf + (cramped ? .1 : .2) -
                              sup.renderedHeight,
                            sup.renderedDepth + (cramped ? .9 : 1) * exHeight
                          )) * rootHalf * multiplier
                        );
  
                    sub.style.top =
                        `${Math.max(sub.baseline, sub.renderedDepth) -
                          fontDimen.baselineHeightOf(family) / rootHalf + Math.max(
                            Math.max(token.div.renderedDepth, 0) / multiplier / rootHalf + .2,
                            sub.renderedHeight - .8 * exHeight
                          ) - depth
                        }em`;
                    heightOffset.style.paddingBottom =
                        `${Math.max(sub.baseline, sub.renderedDepth) * rootHalf -
                          fontDimen.baselineHeightOf(family) + Math.max(
                            Math.max(token.div.renderedDepth, 0) / multiplier / rootHalf + .2,
                            sub.renderedHeight - .8 * exHeight
                          ) * rootHalf
                        }em`;
                    token.div.renderedDepth = 
                        Math.max(
                          token.div.renderedDepth,
                          (sub.renderedDepth * rootHalf + Math.max(
                            Math.max(token.div.renderedDepth, 0) / multiplier / rootHalf + .2,
                            sub.renderedHeight - .8 * exHeight
                          ) * rootHalf) * multiplier
                        );
                  }
  
                  sub.style.height = 0;
                  thinner.style.width = 0;
  
                  token.div.appendChild(heightOffset);
                  token.div.appendChild(thinner);
                  token.div.appendChild(thicker);
                }
              }
            }
  
            // Make boxes from \hbox and \vbox commands.
            if (box) {
              if (box.boxType == "horizontal") {
                // If the box is an \hbox that has been set "to" a width, (\hbox to ...), the width is
                // set directly on the element child.
                let width;
                if (box.to) {
                  width = new DimenReg(box.to);
                  width.em.value += width.sp.value / 12 * 16 / fontSize;
                  width.sp.value = 0;
                } else if (box.spread) {
                  width = new DimenReg(box.spread);
                  width.em.value += width.sp.value / 12 * 16 / fontSize;
                  width.sp.value = 0;
                  let oldFontSize = token.div.style.fontSize;
                  token.div.style.fontSize = "50px";
                  container.appendChild(token.div);
                  let tokenWidth = (token.div.offsetWidth + 1) / 50;
                  container.removeChild(token.div);
                  token.div.style.fontSize = oldFontSize;
                  width.em.value += tokenWidth * 65536;
                }
  
                // A negative width is interpreted as a negative kern to allow for negative margins.
                if (width.em.value < 0) {
                  items.splice(items.length - 1, 0, {
                    type: "kern",
                    dimen: width
                  });
                  // Setting to width: 0 doesn't work for some reason, so this gives it a nonzero but
                  // negligible width.
                  token.div.firstElementChild.style.width = "0.0001px";
                } else if (width.em.value == 0) {
                  token.div.firstElementChild.style.width = "0.0001px";
                } else {
                  token.div.firstElementChild.style.width = `${width.em.value / 65536}em`;
                }
  
                token.div.firstElementChild.style.flexWrap = "";
              } else if (box.boxType == "vertical") {
                // Basically does the same thing as horizontal.
                let height;
                if (box.to) {
                  height = new DimenReg(box.to);
                  height.em.value += height.sp.value / 12 * 16 / fontSize;
                  height.sp.value = 0;
                } else if (box.spread) {
                  height = new DimenReg(box.spread);
                  height.em.value += height.sp.value / 12 * 16 / fontSize;
                  height.sp.value = 0;
                  let oldFontSize = token.div.style.fontSize;
                  token.div.style.fontSize = "50px";
                  container.appendChild(token.div);
                  let tokenHeight = token.div.offsetHeight / 50;
                  container.removeChild(token.div);
                  token.div.style.fontSize = oldFontSize;
                  height.em.value += tokenHeight * 65536;
                }
  
                if (height.em.value < 0) {
                  token.div.firstElementChild.style.height = 0;
                  token.div.firstElementChild.style.verticalAlign = "text-bottom";
                  token.div.firstElementChild.style.position = "relative";
                  token.div.firstElementChild.style.top = `${-height.em.value / 65536}em`;
                  token.div.renderedHeight = 0;
                  token.div.renderedDepth = 0;
                } else {
                  token.div.firstElementChild.style.height = `${height.em.value / 65536}em`;
                  token.div.firstElementChild.style.verticalAlign = "text-bottom";
                  let baselineHeight = fontDimen.baselineHeightOf(family);
                  token.div.renderedDepth =
                      Math.min(baselineHeight, height.em.value / 65536);
                  token.div.renderedHeight =
                      Math.max(height.em.value / 65536 - baselineHeight, 0);
                }
  
                token.div.firstElementChild.style.flexWrap = "";
              }
              token.div.firstElementChild.style.justifyContent = "initial";
            }
  
            // At this point, a normal atom is done rendering. That includes Ord, Bin, Rel, Op,
            // etc. There are some special atoms though, like Vcent and Acc. Some atoms are
            // like Ord atoms but with extra processing. That processing happens here. If the
            // atom isn't special, this step is skipped.
            let lineWidth;
            let fullContainer;
            let widthContainer;
            let overline, underline;
            let clone;
            let heightOffset, widthOffset;
            let width;
            let offset;
            switch (token.atomType) {
              case atomTypes.OVER:
                // To overline an atom, an extra element is added at the front of `token.div' with
                // width: 0. Inside that element, another element is added. This element will be al-
                // lowed to grow to the atom's width. Inside that new element, a clone of the entire
                // atom is added to give the element the correct width. Another element is added. It
                // has position: absolute, left: 0 and right: 0. That lets it inherit the parent's
                // width while not offsetting it with its own width. That absolutely positioned atom
                // atom gets a border-top that will act as the overline. This whole thing is like a
                // simplified version of how fractions are rendered.
  
                // The atom's renderedHeight is set to be at least half the ex height so that an over-
                // line isn't all the way at the bottom. 
                token.div.renderedHeight =
                    Math.max(
                      token.div.renderedHeight || 0,
                      fontDimen.heightOf("x", family) / 2
                    );
  
                lineWidth = fontDimen.visibleWidthOf("|", family);
  
                fullContainer = document.createElement("div");
                fullContainer.style.display = "inline-block";
                fullContainer.style.width =
                    fullContainer.style.height = 0;
                fullContainer.style.position = "relative";
                fullContainer.style.top =
                    `${-fontDimen.baselineHeightOf(family) - token.div.renderedHeight /
                      multiplier - lineWidth - .12}em`;
                fullContainer.style.verticalAlign = "text-bottom";
                fullContainer.style.pointerEvents = "none";
  
                widthContainer = document.createElement("div");
                widthContainer.style.display = "inline-block";
                widthContainer.style.webkitUserSelect =
                    widthContainer.style.mozUserSelect =
                    widthContainer.style.msUserSelect =
                    widthContainer.style.userSelect = "none";
                widthContainer.style.position = "relative";
  
                overline = document.createElement("div");
                overline.style.position = "absolute";
                overline.style.left =
                    overline.style.right = 0;
                overline.style.borderTop = `${lineWidth}em solid currentColor`;
                widthContainer.appendChild(overline);
  
                clone = noWrap(token.div.cloneNode(true));
                clone.style.visibility = "hidden";
                clone.style.fontSize = "";
                widthContainer.appendChild(clone);
                fullContainer.appendChild(widthContainer);
                token.div.insertBefore(fullContainer, token.div.firstElementChild);
  
                heightOffset = document.createElement("div");
                heightOffset.style.height =
                    `${token.div.renderedHeight / multiplier + lineWidth + .16}em`;
                heightOffset.style.display = "inline-block";
                heightOffset.style.width = 0;
                token.div.insertBefore(heightOffset, fullContainer);
  
                token.div.renderedHeight += lineWidth + .16;
  
                break;
  
              case atomTypes.UNDER:
                // Underlined atoms are rendered much the same way as overline.
  
                token.div.renderedDepth = Math.max(token.div.renderedDepth || 0, 0);
  
                lineWidth = fontDimen.visibleWidthOf("|", family);
  
                fullContainer = document.createElement("div");
                fullContainer.style.display = "inline-block";
                fullContainer.style.width =
                    fullContainer.style.height = 0;
                fullContainer.style.position = "relative";
                fullContainer.style.top =
                    `${-fontDimen.baselineHeightOf(family) + token.div.renderedDepth /
                      multiplier + .12}em`;
                fullContainer.style.verticalAlign = "text-bottom";
                fullContainer.style.pointerEvents = "none";
  
                widthContainer = document.createElement("div");
                widthContainer.style.display = "inline-block";
                widthContainer.style.webkitUserSelect =
                    widthContainer.style.mozUserSelect =
                    widthContainer.style.msUserSelect =
                    widthContainer.style.userSelect = "none";
                widthContainer.style.position = "relative";
  
                underline = document.createElement("div");
                underline.style.position = "absolute";
                underline.style.left =
                    underline.style.right = 0;
                underline.style.borderTop = `${lineWidth}em solid currentColor`;
                widthContainer.appendChild(underline);
  
                clone = noWrap(token.div.cloneNode(true));
                clone.style.visibility = "hidden";
                clone.style.fontSize = "";
                clone.style.height = 0;
                widthContainer.appendChild(clone);
                fullContainer.appendChild(widthContainer);
                token.div.insertBefore(fullContainer, token.div.firstElementChild);
  
                heightOffset = document.createElement("div");
                heightOffset.style.verticalAlign = "text-top";
                heightOffset.innerText = "\u00A0";
                heightOffset.style.paddingBottom =
                    `${lineWidth + .16 - fontDimen.baselineHeightOf(family) +
                      token.div.renderedDepth / multiplier}em`;
                heightOffset.style.display = "inline-block";
                heightOffset.style.width = 0;
                token.div.insertBefore(heightOffset, fullContainer);
  
                token.div.renderedDepth += lineWidth + .16;
  
                break;
  
              case atomTypes.ACC:
                // Accents are handled by simply placing the accent character right on top of the
                // current nucleus. Accent characters like "´" (acute, U+00B4) are already offset
                // above the text. There is still some vertical shift though so that the accent
                // goes on top `Math.max(the nucleus's height, the ex height of the font).'
  
                let acc = document.createElement("div");
                acc.style.display = 'inline-block';
                acc.style.position = 'relative';
                if (font == "it") {
                  acc.style.fontStyle = "italic";
                } else if (font == "sl") {
                  acc.style.fontStyle = "oblique";
                } else if (font == "bf") {
                  acc.style.fontWeight = "bold";
                }
                acc.style.top =
                  `${Math.min(fontDimen.heightOf("x", family), token.div.renderedHeight) -
                    token.div.renderedHeight}em`;
                acc.style.width = 0;
                acc.style.lineHeight = 1.1;
                acc.style.height = "1.1em";
                acc.style.verticalAlign = "text-bottom";
                acc.textContent = token.accChar;
  
                offset = token.nucleus &&
                    (token.nucleus.type == "symbol" && (font == "it" || font == "sl")) ?
                      fontDimen.italCorrOf(token.accChar, family) :
                      0;
                offset = offset ||
                    (token.nucleus && token.nucleus.length == 1 && token.nucleus[0].nucleus &&
                      token.nucleus[0].nucleus.type == "symbol" && token.nucleus[0].atomType ==
                      atomTypes.VARIABLE && font == "nm" ?
                      fontDimen.italCorrOf(token.accChar, family) :
                      0
                    );
  
                let oldFontSize = token.div.style.fontSize;
                token.div.style.fontSize = "50px";
                container.appendChild(token.div);
                acc.style.left =
                    `${
                      ((token.div.offsetWidth + 1) / 50 -
                        fontDimen.widthOf(token.accChar, family, font)) / 2 + offset
                    }em`;
                container.removeChild(token.div);
                token.div.style.fontSize = oldFontSize;
                token.div.insertBefore(acc, token.div.firstElementChild);
  
                let spacer = document.createElement("div");
                spacer.style.display = "inline-block";
                spacer.style.width = 0;
                spacer.style.height =
                    `${(token.div.renderedHeight - Math.min(
                      fontDimen.heightOf("x", family),
                      token.div.renderedHeight
                      )) + fontDimen.heightOf(token.accChar, family, font)
                  }em`;
                token.div.insertBefore(spacer, acc);
  
                token.div.renderedHeight =
                    (token.div.renderedHeight - Math.min(
                      fontDimen.heightOf("x", family),
                      token.div.renderedHeight
                    )) + fontDimen.heightOf(token.accChar, family, font);
  
                break;
  
              case atomTypes.VCENT:
                // A vcenter atom vertically centers the atom on the line according to its height
                // and depth.
  
                let axisHeight = fontDimen.heightOf("x", family) / 2;
                offset =
                    (token.div.renderedHeight - axisHeight) - (token.div.renderedDepth + axisHeight);
  
                token.div.style.position = "relative";
                token.div.style.top = `${offset / 2}em`;
                token.div.style.marginTop = `${-offset / 2}em`;
                token.div.style.marginBottom = `${offset / 2}em`;
  
                token.div.renderedHeight -= offset / 2;
                token.div.renderedDepth += offset / 2;
  
                break;
  
              case atomTypes.RAD:
                // Rad atoms are basically Over atoms but with an extra character in front of the
                // atom. If fontTeX.config.buildradical is true, a canvas is used to construct an
                // artificial radical symbol to look correctly aligned with the height of the atom.
                // The user can opt out of that though by changing that setting to false. If it is
                // set to false, a canvas is still used but instead of constructing a radical from
                // a shape, plain text is inserted into the canvas with the radical symbol (U+221A)
                // and stretched to match the height of the atom (it probably won't look correct
                // though unless the character was made specifically to look right in that specific
                // context).
  
                // First an overline is added over the atom in exactly the same matter as if the
                // atom had been an Over atom all along.
                lineWidth = fontDimen.visibleWidthOf("|", family);
                token.div.renderedHeight =
                    Math.max(token.div.renderedHeight || 0, fontDimen.heightOf("x", family) / 2);
                token.div.renderedDepth = Math.max(token.div.renderedDepth || 0, 0);
  
                container.appendChild(token.div);
                width = (token.div.offsetWidth + 1) / fontSize;
                container.removeChild(token.div);
  
                fullContainer = document.createElement("div");
                fullContainer.style.display = "inline-block";
                fullContainer.style.width =
                    fullContainer.style.height = 0;
                fullContainer.style.position = "relative";
                fullContainer.style.top =
                    `${-fontDimen.baselineHeightOf(family) - token.div.renderedHeight /
                      multiplier - lineWidth - .12}em`;
                fullContainer.style.verticalAlign = "text-bottom";
                fullContainer.style.pointerEvents = "none";
  
                widthOffset = document.createElement("div");
                widthOffset.style.display = "inline-block";
                widthOffset.style.webkitUserSelect =
                    widthOffset.style.mozUserSelect =
                    widthOffset.style.msUserSelect =
                    widthOffset.style.userSelect = "none";
                widthOffset.style.position = "relative";
                widthOffset.style.width = `${width}em`;
  
                overline = document.createElement("div");
                overline.style.position = "absolute";
                overline.style.left =
                    overline.style.right = 0;
                overline.style.borderTop = `${lineWidth}em solid currentColor`;
                widthOffset.appendChild(overline);
                widthOffset.appendChild(document.createTextNode("\u00A0"));
                fullContainer.appendChild(widthOffset);
                token.div.insertBefore(fullContainer, token.div.firstElementChild);
  
                heightOffset = document.createElement("div");
                heightOffset.style.height =
                    `${token.div.renderedHeight / multiplier + lineWidth + .16}em`;
                heightOffset.style.display = "inline-block";
                heightOffset.style.width = 0;
                token.div.insertBefore(heightOffset, fullContainer);
  
                token.div.renderedHeight += (lineWidth + .16) * multiplier;
  
                // Now that the atom has an overline on top of it, a <canvas> is added before the en-
                // tire atom (even before the overline) and a radical is drawn inside of it. The can-
                // vas will stretch to fit the entire height of the atom.
                let canvas = document.createElement("canvas");
                let indexX = 0;
                let indexY = 0;
  
                if (settings["radical.build"][0]) {
                  canvas.height = (token.div.renderedDepth + token.div.renderedHeight) * fontSize;
                  canvas.style.height = `${token.div.renderedDepth + token.div.renderedHeight}em`;
                  canvas.style.position = "relative";
                  canvas.style.top = `${token.div.renderedDepth}em`;
                  canvas.style.marginLeft = ".1em";
                  canvas.style.marginTop = `${-token.div.renderedDepth}em`;
  
                  // These variables are used to construct the radical and they correspond to the var-
                  // iables in the two Desmos graphs below.
                  let b = lineWidth;
                  let g = token.div.renderedHeight + token.div.renderedDepth - .04 - b / 2;
                  let w = settings["radical.w"][0];
                  let t = Math.max(0, Math.min(w, settings["radical.t"][0]));
                  let h = Math.max(0, settings["radical.h"][0]);
                  let v = g / Math.max(0, settings["radical.verticalthreshold"][0]);
                  let sqrtv = Math.sqrt(v);
                  let sqrt3 = Math.sqrt(3);
  
                  // If the height of the atom exceeds a certain height, the radical is rendered com-
                  // pletely vertical instead of sloped. That way, no matter how tall the atom is, the
                  // radical can always scale.
                  if (token.div.renderedHeight + token.div.renderedDepth <
                      Math.max(0, settings["radical.verticalthreshold"][0])) {
                    // If the height of the atom doesn't exceed the threshold, it's rendered sloped
                    // instead of vertically. The closer the height is to the threshold, the steeper
                    // the slope of the radical. Once it reaches just under the threshold, the slope
                    // is almost straight up. If you change the "g" variable in the Desmos graph be-
                    // low, you can see how the radical gets steeper until it reaches completely vert-
                    // ical.
                    // Graph: https://www.desmos.com/calculator/azks7czhoq
                    h = Math.min(
                      token.div.renderedHeight + token.div.renderedDepth,
                      h / Math.max(settings["radical.verticalthreshold"][0], 0)
                    );
  
                    // All the math is copied directly from the Desmos graph, but the equations were
                    // rearranged using an algebraic solver, so there's not really any explanation for
                    // what the heck is happening. Just trust that it works :).
                    let o = (b*v*sqrt3)/(6*v*v+2);
                    canvas.width = ((-b*(t*(v-1)-v*w-g*sqrtv+w))/(2*g)+o+w)*fontSize;
                    canvas.style.width = `${(-b*t*(v-1)+b*v*w-w*(b-2*g)+g*(b+2*o))/(2*g)}em`;
                    let context = canvas.getContext("2d");
                    context.fillStyle = cssDeclaration.color;
  
                    let p1 = [
                      Math.max((-b*(t*(v-1)-v*w-g*sqrtv+w))/(2*g),0)+o+w,
                      g-b/2
                    ];
  
                    let p3 = [
                      Math.min((-b*(-t*(v-1)+v*w+g*sqrtv-w))/(2*g)+o+w,p1[0]),
                      g+b/2
                    ];
  
                    let p4 = [
                      (-(4*t*t*v*sqrt3*(v-1)*(v-1)-t*(v-1)*(4*v*v*w*sqrt3+3*b*sqrt3*Math.pow(v,1.5)-4*
                        v*(g*(h-1)-o*sqrt3)+4*g*h)-g*(4*v*v*w*(h-1)+b*Math.pow(v,1.5)*(3*h+2)-4*v*(h*w
                        -o*(h-1))-3*b*h*sqrtv-4*h*o)))/(4*(sqrt3*t*v*(v-1)+g*(v*(h-1)-h))),
                      -(h*g+v*t*sqrt3)/(v*(w-t))*((-(4*t*t*v*sqrt3*(v-1)*(v-1)-t*(v-1)*(4*v*v*w*sqrt3+
                        3*b*sqrt3*Math.pow(v,1.5)-4*v*(g*(h-1)-o*sqrt3)+4*g*h)-g*(4*v*v*w*(h-1)+b*Math
                        .pow(v,1.5)*(3*h+2)-4*v*(h*w-o*(h-1))-3*b*h*sqrtv-4*h*o)))/(4*(sqrt3*t*v*(v-1)
                        +g*(v*(h-1)-h)))-v*(w-t)-t-3*b*sqrtv/4-o)
                    ];
                    let p10 = [
                      Math.max(-t*(v-1)+v*w+b/2*sqrtv+o,-p4[1]*(p3[0]-p4[0])/(p3[1]-p4[1])+p4[0]+p1[0]
                        -(p3[0]-p4[0])/(p3[1]-p4[1])*(p1[1]-p4[1]+(p3[1]-p4[1])/(p3[0]-p4[0])*p4[0])),
                      0
                    ];
  
                    context.beginPath();
                    context.moveTo(
                      p1[0] * fontSize,
                      canvas.height - (p1[1]) * fontSize
                    );
                    context.lineTo(
                      ((-b*(t*(v-1)-v*w-g*sqrtv+w))/(2*g)+o+w) * fontSize,
                      canvas.height - (g+b/2) * fontSize
                    );
                    context.lineTo(
                      p3[0] * fontSize,
                      canvas.height - (p3[1]) * fontSize
                    );
                    context.lineTo(
                      p4[0] * fontSize,
                      canvas.height - (p4[1]) * fontSize
                    );
                    context.lineTo(
                      ((8*t*t*v*sqrt3*(v-1)-t*(8*v*v*w*sqrt3+6*b*Math.pow(v,1.5)*sqrt3+v*(b+8*o*sqrt3)
                        +8*g*h)+b*v*w-6*b*g*h*sqrtv-8*g*h*o)/(8*(t*v*sqrt3*(v-1)-v*v*w*sqrt3-g*h))) *
                        fontSize,
                      canvas.height - (indexY=(v*sqrt3*(8*t*t*v*sqrt3*(v-1)-t*(8*v*v*w*sqrt3+6*b*Math.
                        pow(v,1.5)*sqrt3+v*(b+8*o*sqrt3)+8*g*h)+b*v*w-6*b*g*h*sqrtv-8*g*h*o)/(8*(t*v*
                        sqrt3*(v-1)-v*v*w*sqrt3-g*h))+h*g+b/8)) * fontSize
                    );
                    context.lineTo(
                      0,
                      canvas.height - (h*g+b/8) * fontSize
                    );
                    context.lineTo(
                      2*o * fontSize,
                      canvas.height - (h*g-b/8) * fontSize
                    );
                    context.lineTo(
                      (8*t*t*v*sqrt3*(v-1)-t*(8*v*v*sqrt3*(w-2*o)-6*b*Math.pow(v,1.5)*sqrt3-v*(b-8*o*
                        sqrt3)+8*g*h)-16*o*v*v*w*sqrt3-b*v*w+6*b*g*h*sqrtv-8*g*h*o)/(8*(t*v*sqrt3*(v-1
                        )-v*v*w*sqrt3-g*h)) * fontSize,
                      canvas.height - (v*sqrt3*((8*t*t*v*sqrt3*(v-1)-t*(8*v*v*sqrt3*(w-2*o)-6*b*Math.
                        pow(v,1.5)*sqrt3-v*(b-8*o*sqrt3)+8*g*h)-16*o*v*v*w*sqrt3-b*v*w+6*b*g*h*sqrtv-8
                        *g*h*o)/(8*(t*v*sqrt3*(v-1)-v*v*w*sqrt3-g*h))-2*o)+h*g-b/8) * fontSize
                    );
                    context.lineTo(
                      (-t*(v-1)+v*w-.75*b*sqrtv+o) * fontSize,
                      canvas.height
                    );
                    context.lineTo(
                      p10[0] * fontSize,
                      canvas.height
                    );
                    context.closePath();
                    context.fill();
                    indexX = (p3[0] - p4[0]) / (p3[1] - p4[1]) * (indexY - p4[1]) + p4[0];
                  } else {
                    // The vertical radical is drawn to look like the Desmos graph below. The vertical
                    // line part goes on forever in the graph since there's no limit to its height,
                    // but when it's drawn on the canvas, it ends right above where the overline ends
                    // so that it looks like they connect.
                    // Graph: https://www.desmos.com/calculator/aracwrf7ss
                    h = Math.max(0, Math.min(g, settings["radical.h"][0]));
                    canvas.width = (8*w+b*(4+sqrt3))/8 * fontSize;
                    canvas.style.width = `${(8*w+b*(4+sqrt3))/8}em`;
                    let context = canvas.getContext("2d");
                    context.fillStyle = cssDeclaration.color;
  
                    context.beginPath();
                    context.moveTo(
                      (w+(b*(sqrt3+4))/8) * fontSize,
                      .04 * fontSize
                    );
                    context.lineTo(
                      (w+(b*(sqrt3-4))/8) * fontSize,
                      .04 * fontSize
                    );
                    context.lineTo(
                      (w+(b*(sqrt3-4))/8) * fontSize,
                      canvas.height - ((5*b*(h+t*sqrt3))/(4*(w-t))) * fontSize
                    );
                    context.lineTo(
                      (t*(4*w*sqrt3+b*(3*sqrt3+2)+4*h)-b*(2*w-3*h-1.5*w-h/2*sqrt3))/(4*(w*sqrt3+h)) *
                        fontSize,
                      canvas.height - (indexY = (((t*(4*w*sqrt3+b*(3*sqrt3+2)+4*h)-b*(2*w-3*h))/(4*(w*
                        sqrt3+h)))*sqrt3+h+b/2)) * fontSize
                    );
                    context.lineTo(
                      0,
                      canvas.height - (b/8+h) * fontSize
                    );
                    context.lineTo(
                      b*sqrt3/4 * fontSize,
                      canvas.height - (-b/8+h) * fontSize
                    );
                    context.lineTo(
                      (t*(4*w*sqrt3-b*(3*sqrt3+2)+4*h)+b*(2*w-3*h+1.5*w+h/2*sqrt3))/(4*(w*sqrt3+h)) *
                        fontSize,
                      canvas.height - (((t*(4*w*sqrt3-b*(3*sqrt3+2)+4*h)+b*(2*w-3*h))/(4*(w*sqrt3+h)))
                        *sqrt3+h-b/2) * fontSize
                    );
                    context.lineTo(
                      (w-(b*(6-sqrt3))/8) * fontSize,
                      canvas.height
                    );
                    context.lineTo(
                      (w+(b*(sqrt3+4)/8)) * fontSize,
                      canvas.height
                    );
                    context.closePath();
                    context.fill();
                    indexX = (w+(b*(sqrt3-4))/8);
                  }
                } else {
                  canvas.height = (fontDimen.heightOf("√", family) +
                      fontDimen.depthOf("√", family)) * fontSize;
                  canvas.width = fontDimen.widthOf("√", family) * fontSize;
                  let context = canvas.getContext("2d");
                  canvas.style.height = `${token.div.renderedHeight + token.div.renderedDepth}em`;
                  canvas.style.width = `${fontDimen.widthOf("√", family)}em`;
                  canvas.style.position = "relative";
                  canvas.style.top = `${token.div.renderedDepth}em`;
                  canvas.style.marginTop = `${-token.div.renderedDepth}em`;
                  context.textAlign = "center";
                  context.font = `${fontSize}px ${family}`;
                  context.fillText(
                    "√",
                    canvas.width / 2,
                    canvas.height * (1 - fontDimen.depthOf("√", family))
                  );
                }
                token.div.insertBefore(canvas, heightOffset);
  
                if (token.index.length) {
                  let index = document.createElement("div");
                  index.style.display = "inline-block";
                  index.style.position = "relative";
                  newBox(token.index, "scriptscript", false, font, index);
  
                  index.style.fontSize = "50px";
                  container.appendChild(index);
                  index.style.marginLeft =
                      `${Math.max(
                        -(index.offsetWidth + 1) / 50,
                        -(indexX + .05) / (style == "script" ?
                          rootHalf :
                          style == "scriptscript" ?
                          1 :
                          .5)
                        )
                      }em`;
                  container.removeChild(index);
                  index.style.fontSize =
                      `${style == "script" ? rootHalf : style == "scriptscript" ? 1 : .5}em`;
                  index.style.top =
                      `${(
                        -Math.max(
                          indexY - token.div.renderedDepth,
                          fontDimen.heightOf("x", family) / 2
                        ) / (style == "script" ? rootHalf : style == "scriptscript" ? 1 : .5)) -
                        index.renderedDepth - .1
                      }em`;
                  index.style.left =
                      `${(.05 + indexX) /
                        (style == "script" ? rootHalf : style == "scriptscript" ? 1 : .5)
                      }em`;
  
                  token.div.insertBefore(index, canvas);
                }
  
                break;
            }
  
            continue;
          }
  
          // Make rule boxes here.
          if (token.type == "rule") {
            let rule = document.createElement("div");
            let height = "100%";
            let width = "100%";
            let depth = "";
  
            rule.style.background = "currentColor";
  
            // Convert sp units into em units.
            if (token.height) {
              height = new DimenReg(token.height);
              height.em.value += height.sp.value / 65536 / 6 * 8 / fontSize * 65536;
              height = height.em.value / 65536;
            }
  
            if (token.depth) {
              depth = new DimenReg(token.depth);
              depth.em.value += depth.sp.value / 65536 / 6 * 8 / fontSize * 65536;
              depth = depth.em.value / 65536;
            }
  
            if (token.width) {
              width = new DimenReg(token.width);
              width.em.value += width.sp.value / 65536 / 6 * 8 / fontSize * 65536;
              width = width.em.value / 65536;
            }
  
            // Create an element on the same line.
            if (token.ruleType == "v") {
              if (height == "100%") {
                rule.style.alignSelf = "stretch";
                rule.renderedDepth = 0;
                rule.renderedHeight = 0;
              } else {
                rule.style.height = `${Math.max(height + depth, 0)}em`;
                rule.style.marginBottom = rule.style.top = `${depth}em`;
                rule.style.marginTop = `${-depth}em`;
                rule.style.position = "relative";
                rule.renderedHeight = Math.max(height, 0);
                rule.renderedDepth = Math.max(depth, 0);
              }
  
              // If width is negative, make a negative kern with that width.
              if (width < 0) {
                items.push({
                  type: "kern",
                  dimen: new DimenReg(0, width * 65536)
                });
              } else {
                rule.style.width = `${width}em`;
              }
            } else if (token.ruleType == "h") {
              if (width == "100%") {
                rule.style.width = "100%";
              } else {
                rule.style.width = `${width}em`;
              }
  
              rule.style.height = `${Math.max(height + depth, 0)}em`;
              rule.style.marginBottom = rule.style.top = `${depth}em`;
              rule.style.marginTop = `${-depth}em`;
              rule.style.position = "relative";
              items.push({
                type: "atom",
                atomType: atomTypes.ORD,
                nucleus: {},
                superscript: null,
                subscript: null,
                style: style,
                isLineBreak: true,
                div: document.createElement("div")
              });
              items[items.length - 1].div.style.width = "100%";
              atoms.push(items[items.length - 1]);
            }
  
            let atomWrapper = {
              type: "atom",
              atomType: atomTypes.ORD,
              nucleus: null,
              superscript: null,
              subscript: null,
              style: style,
              div: rule,
              isLineBreak: token.ruleType == "h",
              growHeight: token.ruleType == "v",
              stretchHeight: height == "100%"
            };
  
            items.push(atomWrapper);
            atoms.push(atomWrapper);
  
            if (token.ruleType == "h") {
              items.push({
                type: "atom",
                atomType: atomTypes.ORD,
                nucleus: null,
                superscript: null,
                subscript: null,
                isLineBreak: true,
                div: document.createElement("div")
              });
  
              items[items.length - 1].div.style.width = "100%";
              atoms.push(items[items.length - 1]);
            }
  
            continue;
          }
        }
  
        // If the last atom is a Bin atom, it needs to be turned into an Ord atom.
        if (atoms.length && atoms[atoms.length - 1].atomType == atomTypes.BIN) {
          atoms[atoms.length - 1].atomType = atomTypes.ORD;
        }
  
        // If no items were added to `items`, then it means the whole box will have nothing in it.
        if (!items.length) {
          flex.empty = true;
        }
  
        // Now that atoms have been parsed and turned into HTML, they need to be placed into their
        // parents. This is the step where glues and kerns are handled as well.
        for (let i = 0, l = items.length; i < l; i++) {
          let token = items[i];
          let atomIndex = atoms.indexOf(token);
  
          // Turn italic corrections into em units.
          if (token.italicCorrection) {
            token.dimen = new DimenReg(
              0,
              fontDimen.italCorrOf(token.italicCorrection, family) * 65536
            );
          }
  
          // Convert glues with no growing/shrinking into plain kerns.
          if (token.type == "glue" && (
              token.glue.stretch.type == "dimension" &&
              token.glue.stretch.sp.value == 0 &&
              token.glue.stretch.em.value == 0
            ) && (
              token.glue.shrink.type == "dimension" &&
              token.glue.shrink.sp.value == 0 &&
              token.glue.shrink.em.value == 0
            )) {
            token.type = "kern";
            token.dimen = token.glue.start;
          }
  
          // Make vertical kerns change `verticalOffset` so that tokens that follow are also moved up
          // and down by the same amount.
          if (token.type == "vkern" && (token.dimen.sp.value || token.dimen.em.value)) {
            verticalOffset += token.dimen.em.value;
            verticalOffset += token.dimen.sp.value / 12 * 16 / fontSize;
  
            let flexChild = document.createElement("div");
            flexChild.style.display = "inline-flex";
            flexChild.style.flexWrap = "nowrap";
            flexChild.style.alignItems = "baseline";
  
            // Move the flex child up or down if it needs to be.
            if (verticalOffset) {
              flexChild.style.position = "relative";
              flexChild.style.marginTop = `${verticalOffset / 65536}em`;
              flexChild.style.marginBottom = `${-verticalOffset / 65536}em`;
              flexChild.style.top = `${-verticalOffset / 65536}em`;
              flexChild.verticalRaise = verticalOffset;
            }
  
            childFlexes.push(flexChild);
            continue;
          }
  
          // Handle horizontal kerns now by adding a margin-right to the previous atom.
          if (token.type == "kern" && (token.dimen.sp.value || token.dimen.em.value)) {
            // If there is no previous atom, or the previous atom already has a kern applied to it,
            // make a new element to have the margin-right applied to it instead.
            let lastChild = childFlexes[childFlexes.length - 1];
            if (!lastChild.lastElementChild || lastChild.lastElementChild.style.marginRight) {
              let div = document.createElement("div");
              div.style.display = "inline-block";
              lastChild.appendChild(div);
            }
  
            lastChild.lastElementChild.style.marginRight =
                `${(token.dimen.sp.value / 12 * 16 / fontSize + token.dimen.em.value) / 65536}em`;
  
            continue;
          }
  
          // Glues are different from kerns in that a glue is represented by a growable/shrinkable
          // flex child. With a min-width and max-width, it can grow and shrink to fill the parent
          // flex. Since an element can't have negative width though, glues can only support having
          // a positive width.
          if (token.type == "glue") {
            let glue = document.createElement("div");
  
            let startEmValue =
                (token.glue.start.sp.value / 12 * 16 / fontSize + token.glue.start.em.value) / 65536;
            glue.style.width = `${startEmValue}em`;
  
            // Make infinite dimensions (e.g. \hfil) grow with flex-grow. Each magnitude (1-3) is 1290
            // times more stretchy than the last. This makes \hfill grow 1290 units for every unit an
            // \hfil would grow. In TeX, it should grow infinitely faster, not just 1290, but flex-
            // grow only supports numbers up to 2^31. Since there are three magnitudes, the biggest
            // number you can go is the third root of 2^31, approximately 1290. Some browsers work
            // with values above 2^31 but better to make it work almost perfectly all the time than
            // exactly perfectly some of the time. Since "1filll" reaches 2^31 already, only browsers
            // that support 64-bit numbers will be able to differentiate and render 1filll vs 2filll.
            if (token.glue.stretch.type == "infinite dimension") {
              glue.style.flexGrow =
                  token.glue.stretch.number.value / 65536 *
                  Math.pow(1290, token.glue.stretch.magnitude.value);
            }
            // Plain, finite dimensions are handled similarly to above.
            else if (token.glue.stretch.sp.value || token.glue.stretch.em.value) {
              glue.style.flexGrow = 1;
              glue.style.maxWidth =
                  `${startEmValue +
                    (token.glue.stretch.sp.value / 12 * 16 / fontSize + token.glue.stretch.em.value) /
                    65536
                  }em`;
            }
  
            // Do the same thing for the shrinking dimension.
            if (token.glue.shrink.type == 'infinite dimension') {
              glue.style.flexShrink =
                  token.glue.shrink.number.value / 65536 *
                  Math.pow(1290, token.glue.shrink.magnitude.value);
            } else if (token.glue.shrink.sp.value || token.glue.shrink.em.value) {
              glue.style.flexShrink = 1;
              glue.style.minWidth =
                  `${startEmValue -
                    (token.glue.shrink.sp.value / 12 * 16 / fontSize + token.glue.shrink.em.value) /
                    65536
                  }em`;
            }
  
            childFlexes.push(glue);
            let nextChild = document.createElement("div");
            nextChild.style.display = "inline-flex";
            nextChild.style.flexWrap = "nowrap";
            nextChild.style.alignItems = "baseline";
  
            // Make the next child also be raised/lowered by the `verticalOffset`.
            if (verticalOffset) {
              nextChild.style.position = "relative";
              nextChild.style.marginTop = `${verticalOffset / 65536}em`;
              nextChild.style.marginBottom = `${-verticalOffset / 65536}em`;
              nextChild.style.top = `${-verticalOffset / 65536}em`;
              nextChild.verticalRaise = verticalOffset;
            }
  
            childFlexes.push(nextChild);
            continue;
          }
  
          // Handle inter-atom spacing here. Table found on page 170 of the TeXbook.
          if (token.type == "atom") {
            // If the current atom is a Bin, Rel, or Punct atom, then a new flex box needs to be crea-
            // ted to allow for line breaks. A line break can happen before a Bin or Rel atom, or af-
            // ter a Punct atom. The Punct case is handled after it's already been added to the cur-
            // rent flex-box.
  
            // Add a spacing before a Bin atom.
            if (atomIndex != 0 && token.atomType == atomTypes.BIN) {
              if (style == "display" || style == "text") {
                let spacer = document.createElement("div");
                spacer.style.flexShrink = 1;
                spacer.style.flexGrow = 1;
                spacer.style.maxWidth = `${(4 + 2) / 18}em`;
                spacer.style.width = `${4 / 18}em`;
                childFlexes.push(spacer);
              }
  
              let nextChild = document.createElement("div");
              nextChild.style.display = "inline-flex";
              nextChild.style.flexWrap = "nowrap";
              nextChild.style.alignItems = "baseline";
  
              if (verticalOffset) {
                nextChild.style.position = "relative";
                nextChild.style.marginTop = `${verticalOffset / 65536}em`;
                nextChild.style.marginBottom = `${-verticalOffset / 65536}em`;
                nextChild.style.top = `${-verticalOffset / 65536}em`;
                nextChild.verticalRaise = verticalOffset;
              }
  
              childFlexes.push(nextChild);
            }
  
            // Add a spacing before a Rel atom.
            if (atomIndex != 0 && token.atomType == atomTypes.REL) {
              if ((style == "display" || style == "text") &&
                  atoms[atomIndex - 1].atomType != atomTypes.REL &&
                  atoms[atomIndex - 1].atomType != atomTypes.OPEN) {
                let spacer = document.createElement("div");
                if (atoms[atomIndex - 1].atomType == 6) {
                  spacer.style.width = `${3 / 18}em`;
                } else {
                  spacer.style.flexGrow = 1;
                  spacer.style.maxWidth = `${(5 + 5) / 18}em`;
                  spacer.style.minWidth = `${5 / 18}em`;
                }
                childFlexes.push(spacer);
              }
  
              let nextChild = document.createElement("div");
              nextChild.style.display = "inline-flex";
              nextChild.style.flexWrap = "nowrap";
              nextChild.style.alignItems = "baseline";
  
              if (verticalOffset) {
                nextChild.style.position = "relative";
                nextChild.style.marginTop = `${verticalOffset / 65536}em`;
                nextChild.style.marginBottom = `${-verticalOffset / 65536}em`;
                nextChild.style.top = `${-verticalOffset / 65536}em`;
                nextChild.verticalRaise = verticalOffset;
              }
  
              childFlexes.push(nextChild);
            }
  
            // Add inter-atom glues for every other case now.
            if (atomIndex != 0) {
              let atomToNumber = [
                atomTypes.ORD,
                atomTypes.OP,
                atomTypes.BIN,
                atomTypes.REL,
                atomTypes.OPEN,
                atomTypes.CLOSE,
                atomTypes.PUNCT,
                atomTypes.INNER
              ];
  
              // Convert the atomTypes into numbers from 0 to 7.
              let left = atomToNumber.indexOf(atoms[atomIndex - 1].atomType);
              left = ~left ? left : 0;
              let right = atomToNumber.indexOf(token.atomType);
              right = ~right ? right : 0;
  
              // This is the chart from page 170 of the TeXbook, except some numbers have been set to
              // _ because those glues are handled somewhere else. Negative numbers represent spacings
              // that only show up in non-script style (the numbers in parentheses in the table in the
              // TeXbook). Since Bin, Rel and Punct atoms have their spacing handled elsewhere, their
              // entries are all cleared out.
              let _ = 0;
              let spacing = ([
                          /* Ord  Op Bin Rel Open Close Punct Inner */
                /* Ord   */[   0,  1,  _,  _,   0,    0,    0,   -1 ],
                /* Op    */[   1,  1,  _,  _,   0,    0,    0,   -1 ],
                /* Bin   */[  -2, -2,  _,  _,  -2,    _,    _,   -2 ],
                /* Rel   */[  -3, -3,  _,  _,  -3,    0,    0,   -3 ],
                /* Open  */[   0,  0,  _,  _,   0,    0,    0,    0 ],
                /* Close */[   0,  1,  _,  _,   0,    0,    0,   -1 ],
                /* Punct */[   _,  _,  _,  _,   _,    _,    _,    _ ],
                /* Inner */[  -1,  1,  _,  _,  -1,    0,   -1,   -1 ],
              ])[left][right];
  
              let space = document.createElement("div");
              // Check for non-script spacings.
              if (spacing < 0) {
                spacing = token.style == "script" || token.style == "scriptscript" ? 0 : -spacing;
              }
  
              switch (spacing) {
                case 1:
                  space.style.minWidth = `${3 / 18}em`;
                  space.style.maxWidth = `${3 / 18}em`;
                  break;
  
                case 2:
                  space.style.width = `${4 / 18}em`;
                  space.style.maxWidth = `${(4 + 2) / 18}em`;
                  space.style.flexGrow = 1;
                  space.style.flexShrink = 1;
                  break;
  
                case 3:
                  space.style.minWidth = `${5 / 18}em`;
                  space.style.maxWidth = `${(5 + 5) / 18}`;
                  space.style.flexGrow = 1;
                  break;
              }
  
              if (spacing) {
                childFlexes[childFlexes.length - 1].appendChild(space);
              }
            }
  
            let lastChild = childFlexes[childFlexes.length - 1];
  
            lastChild.renderedHeight =
                Math.max(lastChild.renderedHeight || 0, token.div.renderedHeight);
            lastChild.renderedDepth =
                Math.max(lastChild.renderedDepth || 0, token.div.renderedDepth);
  
            if (token.div.baseline + token.div.baselineOffset <
                lastChild.baseline + lastChild.baselineOffset) {
              lastChild.baseline = lastChild.baseline || 0;
              lastChild.baselineOffset = lastChild.baselineOffset || 0;
            } else {
              lastChild.baseline = token.div.baseline;
              lastChild.baselineOffset = token.div.baselineOffset;
            }
  
            // If the atom is an actual line break item (from "\\"), it should make a new flex
            // box child just like with a Rel or Bin atom.
            if (token.isLineBreak) {
              childFlexes.push(token.div);
  
              let nextChild = document.createElement("div");
              nextChild.style.display = "inline-flex";
              nextChild.style.flexWrap = "nowrap";
              nextChild.style.alignItems = "baseline";
  
              if (verticalOffset) {
                nextChild.style.position = "relative";
                nextChild.style.marginTop = `${verticalOffset / 65536}em`;
                nextChild.style.marginBottom = `${-verticalOffset / 65536}em`;
                nextChild.style.top = `${-verticalOffset / 65536}em`;
                nextChild.verticalRaise = verticalOffset;
              }
  
              childFlexes.push(nextChild);
            }
            // If the atom is from a \vrule, the entire atom is made to grow vertically to have the
            // same height as its parent.
            else if (token.growHeight) {
              let nextChild = document.createElement("div");
              nextChild.style.display = "inline-flex";
              nextChild.style.flexWrap = "nowrap";
              nextChild.style.alignItems = "baseline";
              if (token.stretchHeight) {
                nextChild.style.alignSelf = "stretch";
              }
              if (verticalOffset) {
                nextChild.style.position = "relative";
                nextChild.style.marginTop = `${verticalOffset / 65536}em`;
                nextChild.style.marginBottom = `${-verticalOffset / 65536}em`;
                nextChild.style.top = `${-verticalOffset / 65536}em`;
                nextChild.verticalRaise = verticalOffset;
              }
              nextChild.appendChild(token.div);
              childFlexes.push(nextChild);
  
              nextChild = document.createElement("div");
              nextChild.style.display = "inline-flex";
              nextChild.style.flexWrap = "nowrap";
              nextChild.style.alignItems = "baseline";
  
              if (verticalOffset) {
                nextChild.style.position = "relative";
                nextChild.style.marginTop = `${verticalOffset / 65536}em`;
                nextChild.style.marginBottom = `${-verticalOffset / 65536}em`;
                nextChild.style.top = `${-verticalOffset / 65536}em`;
                nextChild.verticalRaise = verticalOffset;
              }
  
              childFlexes.push(nextChild);
            } else {
              lastChild.appendChild(token.div);
            }
  
            // This is where Punct line breaks are handled.
            if (token.atomType == atomTypes.PUNCT) {
              if ((style == "display" || style == "text") &&
                  atoms[atomIndex + 1] && atoms[atomIndex + 1].atomType != atomTypes.REL) {
                let spacer = document.createElement("div");
                spacer.style.minWidth = `${3 / 18}em`;
                spacer.style.maxWidth = `${3 / 18}em`;
                childFlexes.push(spacer);
              }
  
              let nextChild = document.createElement("div");
              nextChild.style.display = "inline-flex";
              nextChild.style.flexWrap = "nowrap";
              nextChild.style.alignItems = "baseline";
  
              if (verticalOffset) {
                nextChild.style.position = "relative";
                nextChild.style.marginTop = `${verticalOffset / 65536}em`;
                nextChild.style.marginBottom = `${-verticalOffset / 65536}em`;
                nextChild.style.top = `${-verticalOffset / 65536}em`;
                nextChild.verticalRaise = verticalOffset;
              }
  
              childFlexes.push(nextChild);
            }
          }
        }
  
        // Append all the generated elements to the same parent element.
        for (let i = 0, l = childFlexes.length; i < l; i++) {
          flex.appendChild(childFlexes[i]);
  
          flex.renderedHeight = Math.max(
            flex.renderedHeight || 0,
            (childFlexes[i].renderedHeight || 0) + (childFlexes[i].verticalRaise || 0) / 65536
          );
          flex.renderedDepth = Math.max(
            flex.renderedDepth || 0,
            (childFlexes[i].renderedDepth || 0) - (childFlexes[i].verticalRaise || 0) / 65536
          );
  
          if (childFlexes[i].baselineOffset + childFlexes[i].baseline <
              flex.baselineOffset + flex.baseline) {
            flex.baseline = flex.baseline || 0;
            flex.baselineOffset = flex.baselineOffset || 0;
          } else {
            flex.baseline = childFlexes[i].baseline;
            flex.baselineOffset = childFlexes[i].baselineOffset;
          }
        }
  
        // Do the same thing for the entire containing element.
        parent.appendChild(flex);
  
        parent.renderedHeight = Math.max(parent.renderedHeight || 0, flex.renderedHeight);
        parent.renderedDepth = Math.max(parent.renderedDepth || 0, flex.renderedDepth);
  
        if (flex.baselineOffset + flex.baseline < parent.baselineOffset + parent.baseline) {
          parent.baseline = parent.baseline || 0;
          parent.baselineOffset = parent.baselineOffset || 0;
        } else {
          parent.baseline = flex.baseline;
          parent.baselineOffset = flex.baselineOffset
        }
  
        // Return the last character for italic corrections.
        return lastChar;
      }
  
      return div;
    }
  
  
    // These constructors are used in the JSON object below.
  
    // The Primitive class is used in the declaration of TeX primitives. In normal TeX, these can
    // overridden, but since they're used by some code here, they can't be. Commands that have been
    // \let to be set to a primitive CAN be overridden though since they are just macros with the be-
    // havior of a primitive. The `func` argument is the function that is run whenever the primitive
    // is encountered and needs to be evaluated.
    class Primitive {
      constructor(name, func) {
        this.name = name;
        this.function = func;
      }
  
      type = "primitive";
    }
  
    // The Macro class is used for user-defined macros. Normally, these are just expanded into an
    // already-parsed list of tokens, but it can also be a reference to a primitive command. In that
    // case, the primitive command is executed. If a Macro or Primitive object is passed as an argu-
    // ment, the Macro gets a `proxy` property that just means that it is a reference to another
    // macro. Whenever the proxy macro needs to be evaluated, the macro's reference is evaluated. That
    // proxy behavior allows for keeping track of macros that have been defined using \let. When \let
    // is used on a single token (e.g. \let\amp=&) (the command needs to inherit the token's character
    // and catcode), a "macro" is made that consists only of that one token and passed into the con-
    // structor. That way, it will expand to that single token and still be considered a proxy macro.
    // There's a difference though between \let-ting to a primitive\character and \let-ting to a macro
    // that only refrences the primitive\macro. For example:
    //   \def\macro{\hbox} \let\cmdone=\hbox \let\cmdtwo=\macro.
    // In both cases, \hbox is eventually used as the command, but \cmdone is a direct reference to
    // \hbox, but \cmdtwo is a reference to a reference to \hbox. That distinction is made with the
    // second argument. If it's `true` (and the first argument is a macro/primitive), then it means
    // it's a direct reference. Otherwise, it's just a reference to a macro.
    class Macro {
      constructor(replacementTokens, parameterTokens) {
        if (replacementTokens instanceof Primitive || replacementTokens instanceof Macro) {
          if (replacementTokens.proxy) {
            replacementTokens = replacementTokens.original;
          }
          this.proxy = true;
          this.isLet = Boolean(parameterTokens);
          this.original = replacementTokens;
        } else {
          this.proxy = false;
          this.replacement = replacementTokens || [];
          this.parameters = parameterTokens || [];
        }
      }
  
      type = "macro";
    }
  
    // The IntegerReg class is used for integer registers (\count). It holds values between
    // [-(2^53 - 1), 2^53 - 1] or [-9007199254740991, 9007199254740991]. Decimal and fraction values
    // are rounded off.
    class IntegerReg {
      constructor(int, min, max, msg) {
        this.message = msg || "";
        if (int instanceof IntegerReg) {
          this.value = int.value;
          this.parent = int;
          this.min = int.min;
          this.max = int.max;
        } else {
          this.min = min === null || min === undefined ? Number.MIN_SAFE_INTEGER : min;
          this.max = max === null || max === undefined ? Number.MAX_SAFE_INTEGER : max;
          int = isNaN(int) ? 0 : Math.round(int) || 0;
          // Convert infinite values into finite values.
          if (!isFinite(int)) {
            int = int < 0 ? this.min : this.max;
          }
          this.value = Math.max(this.min, Math.min(this.max, int));
        }
      }
  
      type = "integer";
      register = true;
    }
  
    // The DimenReg class is used for dimension registers (\dimen). It hold values between
    // (-137438953472 pt, 137438953472 pt) (since they are stores as scaled points, which are 1/65536
    // of a pt). They are also capable of storing em values, so they can technically hold more than
    // 137438953472 pt since the two are stored as separate numbers. Em values are stored as "scaled"
    // em units. 1 em is stored as 65536. This applies to MuDimenReg and both types of dimension reg-
    // isters.
    class DimenReg {
      constructor(sp, em, msg) {
        this.message = msg || "";
        if (sp instanceof DimenReg) {
          this.sp = new IntegerReg(sp.sp);
          this.em = new IntegerReg(sp.em);
          this.parent = sp;
        } else if (sp instanceof MuDimenReg) {
          this.sp = new IntegerReg(0);
          this.em = new IntegerReg(sp.mu / 18);
        } else {
          this.sp = new IntegerReg(sp);
          this.em = new IntegerReg(em);
        }
      }
  
      type = "dimension";
      register = true;
    }
  
    // The MuDimenReg class is exactly like the DimenReg class except that all units measured in terms
    // of math units (18mu = 1em). There is no sp or em value, just a mu value.
    class MuDimenReg {
      constructor(mu, msg) {
        this.message = msg || "";
        if (mu instanceof MuDimenReg) {
          this.mu = new IntegerReg(mu.mu);
          this.parent = mu;
        } else if (mu instanceof DimenReg) {
          this.mu = new IntegerReg(mu.em / 18 + mu.sp / 65536 / 12 * 18);
        } else {
          this.mu = new IntegerReg(mu);
        }
      }
  
      type = "mu dimension";
      register = true;
    }
  
    // The GlueReg class is used for glue registers (\skip). They are basically three DimenReg objects
    // in one. They can also hold infinite values though for their stretch and shrink values (stored
    // as InfDimen objects). There are three magnitudes of infinities (fil, fill, and filll).
    class GlueReg {
      constructor(start, stretch, shrink, msg) {
        this.message = msg || "";
        if (start instanceof GlueReg) {
          this.start = new DimenReg(start.start);
          this.stretch = new DimenReg(start.stretch);
          this.shrink = new DimenReg(start.shrink);
          this.parent = start;
        } else {
          this.start = new DimenReg(start);
          this.stretch = stretch instanceof InfDimen ? stretch : new DimenReg(stretch);
          this.shrink = shrink instanceof InfDimen ? shrink : new DimenReg(shrink);
        }
      }
  
      type = "glue";
      register = true;
    }
  
    // The MuGlueReg class is exactly the same as the GlueReg class except that it only
    // keeps track of units in terms of math units (18mu = 1em).
    class MuGlueReg {
      constructor (start, stretch, shrink, msg) {
        this.message = msg || "";
        if (start instanceof MuGlueReg) {
          this.start = new MuDimenReg(start.start);
          this.stretch = new MuDimenReg(start.stretch);
          this.shrink = new MuDimenReg(start.shrink);
          this.parent = start;
        } else {
          this.start = new MuDimenReg(start);
          this.stretch = stretch instanceof InfDimen ? stretch : new MuDimenReg(stretch);
          this.shrink = shrink instanceof InfDimen ? shrink : new MuDimenReg(shrink);
        }
      }
  
      type = "mu glue";
      register = true;
    }
  
    // This is a kind-of dimension used for GlueReg objects. They represent fil, fill, and filll val-
    // ues. `num` is the number of infinities, `mag` is the magnitude.
    // 1fil < 100fil < 1fill < 100fill < 1filll < 100filll.
    class InfDimen {
      constructor(num, mag, msg) {
        this.message = msg || "";
        this.number = new IntegerReg(num);
        this.magnitude = new IntegerReg(mag);
      }
  
      type = "infinite dimension";
      register = true;
    }
  
    // This is a helper function used inside primitives to indicate the function failed.
    function fail(token) {
      token.invalid = true;
      return [token];
    }
  
    // Given a token, returns if the token is an exapndable macro or an active character.
    function expandable(token) {
      return token && (token.type == "command" || token.type == "character" &&
          token.cat == catcodes.ACTIVE);
    }
  
    // Gets the next token (given a mouth) and checks if it's an equal sign, for use in definitions
    // where the equals is optional.
    function doOptEqual(mouth) {
      let optEquals = mouth.eat();
      if (!(optEquals && optEquals.type == "character" && optEquals.char == "=" &&
          optEquals.cat == catcodes.OTHER)) {
        mouth.revert();
      }
    }
  
    // The `data` object defined below is where most the user data is stored (like user-defined mac-
    // ros) along with other stuff like primitives and registers. This object gets cloned for each
    // <font-tex> element, since definitions made inside each one shouldn't affect definitions made in
    // others (unless the definition is preceded by \global). That clone is also in turn cloned when-
    // ever a new group is opened (typically with "{ ... }" delimiters) since definitions are also lo-
    // cal only to that group.
    let data = {
      defs: {
        primitive: {
          // This is where TeX's primitive commands are stored. Each key name is the name of the com-
          // mand. Each key's value is a Primitive object that stores the function to be executed each
          // time the primitive needs to be evaluated. The function gets one argument when called that
          // contains all the data and functions necessary for the function to perform its action.
          "(": new Primitive("(", function(e) {
            // The \( is technically not a primitive in TeX, but it's treated as one here so that it
            // can't be deleted. If a \( is found while parsing, it indicated the start of a new in-
            // line equation. But since this function can only ever run when an equation has already
            // been opened, it should always return as invalid.
  
            return fail(this);
          }),
          ")": new Primitive(")", function(e) {
            // This is the closing version of \(. This could actually be implemented as a macro
            // instead of as a primitive, but it'd be weird to have a \( primitive but not a \).
  
            if (e.style == "inline") {
              return [{
                type: "character",
                char: "$",
                code: "$".codePointAt(0),
                cat: catcodes.MATHSHIFT
              }];
            } else {
              return fail(this);
            }
          }),
          "/": new Primitive("/", function(e) {
            // The \/ command is an italic correction. Right now, a basic kern is added that's marked
            // with an italicCorrection tag. Later, when kerns and glues are being evaluated, the
            // kern's actual width will be determined based on the last character. In plain TeX, ital-
            // ic correction information comes with the font's parameters. In this version, an italic
            // correction has to be determined manually (by `fontDimen.italCorrOf').
  
            if (e.lastContext.type == "superscript" || e.lastContext.type == "subscript") {
              return fail(this);
            }
  
            e.tokens.push({
              type: "kern",
              dimen: new DimenReg(0),
              italicCorrection: true
            });
            return [];
          }),
          "[": new Primitive("[", function(e) {
            // This is just like the "\(" command except for displayed equations.
  
            return fail(this);
          }),
          "]": new Primitive("]", function(e) {
            // The \) version for displayed equations.
  
            if (e.style == "display") {
              return [{
                type: "character",
                char: "$",
                code: "$".codePointAt(0),
                cat: catcodes.MATHSHIFT
              },{
                type: "character",
                char: "$",
                code: "$".codePointAt(0),
                cat: catcodes.MATHSHIFT
              }];
            } else {
              return fail(this);
            }
          }),
          above: new Primitive("above", function(e) {
            // \above creates fraction tokens. All the tokens in the current scope up to the \above
            // are used as the numerator and all the tokens after it are used as the denominator.
            // \above takes one dimension argument that sets the width of the fraction bar. There is
            // also \abovewithdelims, \atop, \atopwithdelims, \over, and \overwithdelims.
  
            if (e.lastContext.type == "superscript" || e.lastContext.type == "subscript") {
              return fail(this);
            }
  
            // First, the dimension token has to be eaten.
            let dimen = e.mouth.eat("dimension");
            if (!dimen) {
              return fail(this);
            }
  
            // Mark the last scope as a fraction.
            e.lastScope.isFrac = true;
  
            // Every fraction has delimiters corresponding around it similar to \left ... \right,
            // except they are always rendered in the same size regardless of the size of the fraction
            // inside. Most of the time, the delimiters are hidden (as in this case) by setting the
            // delimiters to "."
            e.lastScope.fracRightDelim = e.lastScope.fracRightDelim = ".";
            e.lastScope.barWidth = dimen;
  
            if (e.lastScope.root) {
              // Mark the root token as invalid.
              e.lastScope.root.invalid = true;
              // And change it to false for the future.
              e.lastScope.root = false;
            }
  
            e.lastScope.fracNumerator = e.lastScope.tokens;
            e.lastScope.tokens = [];
  
            return [];
          }),
          abovewithdelims: new Primitive("abovewithdelims", function(e) {
            // \abovewithdelims works like the regular \above except a pair of delimiters go
            // around the fraction. The delimiters are like the \left\right ones except their
            // size is determined by the current style, not the height of the fraction.
  
            if (e.lastContext.type == "superscript" || e.lastContext.type == "subscript") {
              return fail(this);
            }
  
            let aboveDelimsSym = Symbol();
            e.mouth.saveState(aboveDelimsSym);
  
            // Now the delimiters need to be looked for. Macros are expanded here the way \left ex-
            // pands macros to look for delimiters.
            while (true) {
              let token = e.mouth.eat();
  
              if (expandable(token)) {
                let expansion = e.mouth.expand(token, e.mouth);
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              } else if (token && token.type == "character" && data.delims.includes(token.code) &&
                  (token.cat == catcodes.OTHER || token.cat == catcodes.LETTER)) {
                if (e.lastScope.fracLeftDelim) {
                  e.lastScope.fracRightDelim = token.char;
                  break;
                } else {
                  e.lastScope.fracLeftDelim = token.char;
                }
              } else {
                e.mouth.loadState(aboveDelimsSym);
                delete e.lastScope.fracLeftDelim;
                return fail(this);
              }
            }
  
            // Look for a dimension now.
            let dimen = e.mouth.eat("dimension");
            if (!dimen) {
              return fail(this);
            }
  
            e.lastScope.isFrac = true;
            e.lastScope.barWidth = dimen;
  
            if (e.lastScope.root) {
              e.lastScope.root.invalid = true;
              e.lastScope.root = false;
            }
  
            e.lastScope.fracNumerator = e.lastScope.tokens;
            e.lastScope.tokens = [];
  
            return [];
          }),
          accent: new Primitive("accent", function(e) {
            // \accent takes an integer argument and converts it into a character via its code point.
            // The next atom then gets accented with the character. This is mostly used for macros,
            // like \~ (displays a tilde over the next atom). Technically though, any character can
            // be an accent over any character. You could for example accent a an "A" with an "a"
            // accent. It'll look stupid and ugly, but you still could.
  
            if (e.lastContext.type == "superscript" || e.lastContext.type == "subscript") {
              return fail(this);
            }
  
            let accentSym = Symbol();
            e.mouth.saveState(accentSym);
            let codePoint = e.mouth.eat("integer");
            if (!codePoint || codePoint.value < 0) {
              e.mouth.loadState(accentSym);
              return fail(this);
            }
            // Instead of adding an Acc atom to the tokens list, a temporary token is added in-
            // stead. At the end of the whole tokenization process, the temporary token is ap-
            // plied to the next atom's nucleus. If the next token isn't an atom, then the
            // command is rendered invalid.
            e.tokens.push({
              type: "accent modifier",
              char: String.fromCodePoint(codePoint.value),
              code: codePoint.value,
              token: this
            });
            return [];
          }),
          advance: new Primitive("advance", function(e) {
            // \advance advances (adds to) a register by a specified value.
  
            if (e.lastContext.type == "superscript" || e.lastContext.type == "subscript") {
              return fail(this);
            }
  
            let advanceSym = Symbol();
            e.mouth.saveState(advanceSym);
  
            while (true) {
              let register = e.mouth.eat();
  
              if (expandable(register)) {
                let expansion = e.mouth.expand(register, e.mouth);
  
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              } else if (register && register.register) {
                let token = e.mouth.eat();
  
                if (token && token.type == "character" && (token.char == "b" || token.char == "B") &&
                    token.cat != catcodes.ACTIVE) {
                  let y = e.mouth.eat();
                  if (!(y && y.type == "character" && (y.char == "y" || y.char == "Y") &&
                      y.cat != catcodes.ACTIVE)) {
                    e.mouth.revert(2);
                  }
                } else if (token) {
                  e.mouth.revert();
                } else {
                  e.mouth.loadState(advanceSym);
                  return fail(this);
                }
  
                if (register.type == "integer") {
                  let token = e.mouth.eat("integer");
  
                  if (token) {
                    register.value += token.value;
                    let reg = register;
                    // If an \advance is \global, then all the registers in the enclosing scopes are
                    // also changed. Instead of just advancing their individual values however, they
                    // are all set to the value of the register in the current scopes. Consider this:
                    //   \count0=5 {\count0=10 \global\advance\count0 by 10}
                    // In the outer scope, \count0 is set to 5. In the inner scope, \count0 is set to
                    // 10, which doesn't affect \count0's value in the outer scope (i.e. after the
                    // group is closed, \count0 should still be 5). The \global\advance command how-
                    // ever is advancing the inner \count0's value by 10. 10 + 10 = 20 so \count0 in
                    // the inner scope should now have a value of 20. The outer scope's \count0 does
                    // not get incremented by 10 in the same wya though; its value is changed to match
                    // the inner \count0's value of 20. This rule applies to \multiply and \divide as
                    // well.
                    if (e.toggles.global && e.lastScope.registers.named.globaldefs.value >= 0 ||
                        e.lastScope.registers.named.globaldefs.value > 0) {
                      while (register.parent) {
                        register = register.parent;
                        register.value = reg.value;
                      }
                    }
                    e.toggles.global = false;
                  } else {
                    e.mouth.loadState(advanceSym);
                    return fail(this);
                  }
                } else if (register.type == "dimension") {
                  let token = e.mouth.eat('dimension');
  
                  if (token) {
                    register.sp.value += token.sp.value;
                    register.em.value += token.em.value;
                    let reg = register;
                    if (e.toggles.global && e.lastScope.registers.named.globaldefs.value >= 0 ||
                        e.lastScope.registers.named.globaldefs.value > 0) {
                      while (register.parent) {
                        register = register.parent;
                        register.sp.value = reg.sp.value;
                        register.em.value = reg.em.value;
                      }
                    }
                    e.toggles.global = false;
                  } else {
                    e.mouth.loadState(advanceSym);
                    return fail(this);
                  }
                } else if (register.type == "mu dimension") {
                  let token = e.mouth.eat('mu dimension');
  
                  if (token) {
                    register.mu.value += token.mu.value;
                    let reg = register;
                    if (e.toggles.global && e.lastScope.registers.named.globaldefs.value >= 0 ||
                        e.lastScope.registers.named.globaldefs.value > 0) {
                      while (register.parent) {
                        register = register.parent;
                        register.mu.value = reg.mu.value;
                      }
                    }
                    e.toggles.global = false;
                  } else {
                    e.mouth.loadState(advanceSym);
                    return fail(this);
                  }
                } else if (register.type == "glue") {
                  let token = e.mouth.eat("glue");
  
                  if (token) {
                    register.start.sp.value += token.start.sp.value;
                    register.start.em.value += token.start.em.value;
  
                    if (token.stretch.type == "infinite dimension") {
                      if (register.stretch.type == "infinite dimension" &&
                          register.stretch.magnitude.value == token.stretch.magnitude.value) {
                        register.stretch.number.value += token.stretch.number.value;
                      } else if (register.stretch.type != 'infinite dimension' ||
                          register.stretch.magnitude.value < token.stretch.magnitude.value) {
                        register.stretch =
                            new InfDimen(token.stretch.number.value, token.stretch.magnitude.value);
                      }
                    } else if (register.stretch.type != "infinite dimension") {
                      register.stretch.sp.value += token.stretch.sp.value;
                      register.stretch.em.value += token.stretch.em.value;
                    }
  
                    if (token.shrink.type == "infinite dimension") {
                      if (register.shrink.type == "infinite dimension" &&
                          register.shrink.magnitude.value == token.shrink.magnitude.value) {
                        register.shrink.number.value += token.shrink.number.value;
                      } else if (register.shrink.type != "infinite dimension" ||
                          register.shrink.magnitude.value < token.shrink.magnitude.value) {
                        register.shrink =
                            new InfDimen(token.shrink.number.value, token.shrink.magnitude.value);
                      }
                    } else if (register.shrink.type != "infinite dimension") {
                      register.shrink.sp.value += token.shrink.sp.value;
                      register.shrink.em.value += token.shrink.em.value;
                    }
  
                    let reg = register;
                    if (e.toggles.global && e.lastScope.registers.named.globaldefs.value >= 0 ||
                        e.lastScope.registers.named.globaldefs.value > 0) {
                      while (register.parent) {
                        register = register.parent;
                        register.start.sp.value += token.start.sp.value;
                        register.start.em.value += token.start.em.value;
                        if (reg.stretch.type == "infinite dimension") {
                          register.stretch =
                              new InfDimen(reg.stretch.number.value, reg.stretch.magnitude.value);
                        } else {
                          register.stretch = new DimenReg(reg.stretch.sp.value, reg.stretch.em.value);
                        }
                        if (reg.shrink.type == "infinite dimension") {
                          register.shrink =
                              new InfDimen(reg.shrink.number.value, reg.shrink.magnitude.value);
                        } else {
                          register.shrink = new DimenReg(reg.shrink.sp.value, reg.shrink.em.value);
                        }
                      }
                    }
                    e.toggles.global = false;
                  } else {
                    e.mouth.loadState(advanceSym);
                    return fail(this);
                  }
                } else if (register.type == "mu glue") {
                  let token = e.mouth.eat("mu glue");
  
                  if (token) {
                    register.start.mu.value += token.start.mu.value;
                    if (token.stretch.type == "infinite dimension") {
                      if (register.stretch.type == "infinite dimension" &&
                          register.stretch.magnitude.value == token.stretch.magnitude.value) {
                        register.stretch.value += token.stretch.value;
                      } else if (register.stretch.type != "infinite dimension" ||
                          register.stretch.magnitude.value < token.stretch.magnitude.value) {
                        register.stretch =
                            new InfDimen(token.stretch.number.value, token.stretch.magnitude.value);
                      }
                    } else if (register.stretch.type != "infinite dimension") {
                      register.stretch.mu.value += token.stretch.mu.value;
                    }
  
                    if (token.shrink.type == "infinite dimension") {
                      if (register.shrink.type == "infinite dimension" &&
                          register.shrink.magnitude.value == token.shrink.magnitude.value) {
                        register.shrink.value += token.shrink.value;
                      } else if (register.shrink.type != "infinite dimension" ||
                          register.shrink.magnitude.value < token.shrink.magnitude.value) {
                        register.shrink =
                            new InfDimen(token.shrink.number.value, token.shrink.magnitude.value);
                      }
                    } else if (register.shrink.type != "infinite dimension") {
                      register.shrink.mu.value += token.shrink.mu.value;
                    }
  
                    let reg = register;
                    if (e.toggles.global && e.lastScope.registers.named.globaldefs.value >= 0 ||
                        e.lastScope.registers.named.globaldefs.value > 0) {
                      while (register.parent) {
                        register = register.parent;
                        register.start.mu.value = reg.start.mu.value;
                        if (reg.stretch.type == "infinite dimension") {
                          register.stretch =
                              new InfDimen(reg.stretch.number.value, reg.stretch.magnitude.value);
                        } else {
                          register.stretch = new MuDimenReg(reg.stretch.mu.value);
                        }
                        if (reg.shrink.type == "infinite dimension") {
                          register.shrink =
                              new InfDimen(reg.shrink.number.value, reg.shrink.magnitude.value);
                        } else {
                          register.stretch = new MuDimenReg(reg.shrink.mu.value);
                        }
                      }
                    }
                    e.toggles.global = false;
                  } else {
                    e.mouth.loadState(advanceSym);
                    return fail(this);
                  }
                }
                break;
              } else {
                e.mouth.loadState(advanceSym);
                return fail(this);
              }
            }
            return [];
          }),
          atop: new Primitive("atop", function(e) {
            // \atop is exactly equivalent "\above0pt". Basically, the fraction bar is always 0pt
            // high, which means it's invisible altogether and the numerator and denominator are right
            // over each other with nothing in between.
            if (e.lastContext.type == "superscript" || e.lastContext.type == "subscript") {
              return fail(this);
            }
  
            // Mark the last scope as a fraction.
            e.lastScope.isFrac = true;
  
            // Every fraction has delimiters that act like \left and \right delimiters. In the
            // case of \above, it has empty delimiters, which are just period tokens. You can
            // use \abovewithdelims to change the delimiters.
            e.lastScope.fracLeftDelim = e.lastScope.fracRightDelim = ".";
  
            e.lastScope.barWidth = new DimenReg(0);
  
            if (e.lastScope.root) {
              e.lastScope.root.invalid = true;
              e.lastScope.root = false;
            }
  
            e.lastScope.fracNumerator = e.lastScope.tokens;
            e.lastScope.tokens = [];
  
            return [];
          }),
          atopwithdelims: new Primitive("atopwithdelims", function(e) {
            // Combination of \atop and \abovewithdelims.
  
            if (e.lastContext.type == "superscript" || e.lastContext.type == "subscript") {
              return fail(this);
            }
  
            let atopDelimsSym = Symbol();
            e.mouth.saveState(atopDelimsSym);
  
            while (true) {
              let token = e.mouth.eat();
  
              if (expandable(token)) {
                let expansion = e.mouth.expand(token, e.mouth);
  
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              } else if (token && token.type == "character" && data.delims.includes(token.code) &&
                  (token.cat == catcodes.OTHER || token.cat == catcodes.LETTER)) {
                if (e.lastScope.fracLeftDelim) {
                  e.lastScope.fracRightDelim = token.char;
                  break;
                } else {
                  e.lastScope.fracLeftDelim = token.char;
                }
              } else {
                e.mouth.loadState(atopDelimsSym);
                delete e.scopes.last().fracLeftDelim;
                return fail(this);
              }
            }
  
            e.lastScope.isFrac = true;
  
            e.lastScope.barWidth = new DimenReg(0);
  
            if (e.lastScope.root) {
              e.lastScope.root.invalid = true;
              e.lastScope.root = false;
            }
  
            e.lastScope.fracNumerator = e.lastScope.tokens;
            e.lastScope.tokens = [];
  
            return [];
          }),
          begingroup: new Primitive("begingroup", function(e) {
            // \begingroup is almost exactly like {, except that only an \endgroup can close it. A }
            // won't suffice. It opens a scope similar to how { would, but the scope is marked as
            // `semisimple` (indicating it was open by \begingroup).
  
            // First make sure no superscript or subscript context is open.
            if (e.lastContext.type == "superscript" || e.lastContext.type == "subscript") {
              return fail(this);
            }
  
            let beginGSym = Symbol();
            e.mouth.saveState(beginGSym);
  
            new e.Scope();
            let lastScope = e.scopes[e.scopes.length - 1];
            lastScope.semisimple = true;
            e.openGroups.push(this);
            e.contexts.push({
              toString: () => "scope",
              type: "scope"
            });
            this.ignore = true;
            lastScope.tokens.push(this);
            return [];
          }),
          bf: new Primitive("bf", function(e) {
            // \bf makes all the characters in the rest of the scope upright and bolded.
  
            if (e.lastContext.type == "superscript" || e.lastContext.type == "subscript") {
              return fail(this);
            }
  
            e.tokens.push({
              type: "font modifier",
              value: "bf"
            });
            return [];
          }),
          catcode: new Primitive("catcode", function(e) {
            // \catcode gets or sets the category code of a character. Catcodes determine how
            // a character behaves. "{" has catcode 1 and signifies the start of a new group.
  
            if (e.lastContext.type == "superscript" || e.lastContext.type == "subscript") {
              return fail(this);
            }
  
            let codePoint = e.mouth.eat("integer");
  
            if (codePoint) {
              if (codePoint.value < 0) {
                e.mouth.revert();
                return fail(this);
              }
              if (!(codePoint.value in data.cats)) {
                data.cats[codePoint.value] = new IntegerReg(catcodes.OTHER, 0, 15);
                for (let i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].cats[codePoint.value] =
                      new IntegerReg((i == 0 ? data : e.scopes[i - 1]).cats[codePoint.value]);
                }
              }
              return [e.lastScope.cats[codePoint.value]];
            } else {
              return fail(this);
            }
          }),
          char: new Primitive("char", function(e) {
            // \char is different in FontTeX than \char from plain TeX/LaTeX. In plain TeX, the number
            // passed to \char includes the family number and the number between [0, 255] that tells
            // the character in the family. In this version, since there are no families, only the
            // character code of the character is passed as the number.
  
            let codePoint = e.mouth.eat("integer");
            if (!codePoint || codePoint.value < 0) {
              return fail(this);
            }
            e.mouth.queue.unshift({
              type: "character",
              cat: catcodes.OTHER,
              char: String.fromCodePoint(codePoint.value),
              code: codePoint.value
            });
            return [];
          }),
          chardef: new Primitive("chardef", function(e) {
            // \chardef is used to easily create macros that refer to a single character. The syntax
            // is \chardef[command name]=[number] and is basically \def[command name]{\char[number]}.
            // There is one difference though. In regular TeX, \chardef can also act like a number. In
            // this version though, that's not the case. Most of the code is the same as \countdef.
  
            if (e.lastContext.type == "superscript" || e.lastContext.type == "subscript") {
              return fail(this);
            }
  
            let charDefSym = Symbol();
            e.mouth.saveState(charDefSym);
            let name = e.mouth.eat();
  
            if (name && name.type == "command") {
              if (name.name in data.defs.primitive || name.name in data.parameters) {
                e.mouth.loadState(charDefSym);
                return fail(this);
              }
  
              doOptEqual(e.mouth);
  
              let integer = e.mouth.eat("integer");
              if (!integer || integer.value < 0) {
                e.mouth.loadState(charDefSym);
                return fail(this);
              }
              let macro = new Macro([{
                type: "character",
                cat: catcodes.OTHER,
                char: String.fromCodePoint(integer.value),
                code: integer.value
              }], []);
              if (e.toggles.global && e.lastScope.registers.named.globaldefs.value >= 0 ||
                  e.lastScope.registers.named.globaldefs.value > 0) {
                data.defs.macros[name.name] = macro;
                delete data.registers.named[name.name];
                for (let i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].defs.macros[name.name] = macro;
                  delete e.scopes[i].registers.named[name.name];
                }
              } else {
                e.lastScope.defs.macros[name.name] = macro;
                delete e.lastScope.registers.named[name.name];
              }
              e.toggles.global = false;
            } else {
              e.mouth.loadState(charDefSym);
              return fail(this);
            }
          }),
          count: new Primitive("count", function(e) {
            // Returns the integer register at the specified index.
  
            let count = e.mouth.eat("integer");
            if (!count || count.value < 0) {
              return fail(this);
            }
            if (!data.registers.count[count.value]) {
              data.registers.count[count.value] = new IntegerReg(0);
              for (let i = 0, l = e.scopes.length; i < l; i++) {
                e.scopes[i].registers.count[count.value] =
                    new IntegerReg((i ? e.scopes[i - 1] : data).registers.count[count.value]);
              }
            }
            return [e.lastScope.registers.count[count.value]];
          }),
          countdef: new Primitive("countdef", function(e) {
            // \countdef creates a named register at the specified number.
  
            if (e.lastContext.type == "superscript" || e.lastContext.type == "subscript") {
              return fail(this);
            }
  
            let countDefSym = Symbol();
            e.mouth.saveState(countDefSym);
            let name = e.mouth.eat();
  
            // Check that the name is a command. Active characters can also hold register values, but
            // that would require a whole new object on `data` and all child scopes to implement, so
            // it's just restricted to command tokens in this version.
            if (name.type == "command") {
              // Make sure it won't overwrite a primitive or parameter.
              if (name.name in data.defs.primitive || name.name in data.parameters) {
                e.mouth.loadState(countDefSym);
                return fail(this);
              }
              
              doOptEqual(e.mouth);
  
              // Get the integer of the count register to point to.
              let integer = e.mouth.eat("integer");
              if (!integer || integer.value < 0) {
                e.mouth.loadState(countDefSym);
                return fail(this);
              }
  
              name = name.name;
              integer = integer.value;
  
              // Before making a reference to the register, make sure each level of the scopes actual-
              // ly has a count register there to begin with. If a scope doesn't, a new one is made
              // with its initial value set to 0. The new reference will be pointing to the newly cre-
              // ated register.
              if (!data.registers.count[integer]) {
                data.registers.count[integer] = new IntegerReg(0);
                for (let i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].registers.count[integer] = new IntegerReg((i ? e.scopes[i - 1] : data).registers.count[integer]);
                }
              }
              // Now make the reference. If it's \global a new command is made at all levels. If not,
              // only the current scope is affected and the register will be deleted once the scope
              // closes.
              if (e.toggles.global && e.lastScope.registers.named.globaldefs.value >= 0 ||
                  e.lastScope.registers.named.globaldefs.value > 0) {
                data.registers.named[name] = data.registers.count[integer];
                // Any existing macro with the name of the command has to be deleted so that there
                // will only be one command with the name that will point to the register.
                delete data.defs.macros[name];
                // Do the same thing for each scopes.
                for (let i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].registers.named[name] = e.scopes[i].registers.count[integer];
                  delete e.scopes[i].defs.macros[name];
                }
              } else {
                // Only affect the current scope.
                e.lastScope.registers.named[name] = e.lastScope.registers.count[integer];
                delete e.lastScope.defs.macros[name];
              }
            } else {
              e.mouth.loadState(countDefSym);
              return fail(this);
            }
          }),
          cr: new Primitive("cr", function(e) {
            // \cr is used exclusively in \halign (and macros that build on top of \halign). This
            // function will return invalid if the current scope is not associated with a \halign. If
            // it IS associated with a \halign, it will check for \noalign and \omit commands and
            // create a new scope for the next table cell to store its data in.
  
            if (e.lastContext.type != "scope") {
              return fail(this);
            }
  
            // Each \halign row's \cr is iterated over twice. Each cell has a preamble that is
            // split into two parts: the tokens that come before the cell's content and those
            // the come after. If a \cr is found, the second part of the preamble still needs
            // to be parsed to complete the cell. To do that, each \cr is iterated over twice.
            // The first time, it signals that the second part of the cell's preamble needs to
            // be parsed. It adds tokens to the mouth corresponding to the second part of the
            // preamble. Those tokens are followed up by the current \cr token again. After the
            // preamble tokens are parsed and the same \cr is reached again, that's when the
            // row is really closed. The first time the \cr is encountered, it doesn't matter
            // if the current scope is a cell because the preamble may change the scopes still.
            // The second time it's encountered though, it means there is no preamble left to
            // change the scope, so the \cr MUST be in a cell's scope to be considered valid.
  
            // First we get the cell's scope by going backwards in the scope chain until we find a
            // halign or halign cell scope.
            let cellScope = false;
            for (let i = e.scopes.length - 1; i >= 0; i--) {
              if (e.scopes[i].isHalign || e.scopes[i].isHalignCell) {
                cellScope = e.scopes[i];
                break;
              }
            }
            // If there was no halign scope, this is a misplaced \cr.
            if (!cellScope) {
              return fail(this);
            }
  
            // If this is a halign cell scope, get the parent halign scope.
            var halignScope =
                cellScope.isHalign ? cellScope : cellScope.parentScope;
  
            // Get the row this \cr will end.
            var row =
                cellScope.isHalign ? null : halignScope.cellData[halignScope.cellData.length - 1];
  
  
            if (row && row[row.length - 1].omit) {
              this.postPreamble = true;
            }
  
            // If this isn't a halign scope
            if (this.postPreamble && !e.lastScope.isHalign && !e.lastScope.isHalignCell) {
              this.invalid = true;
              return [this];
            }
  
            // \cr means the current row for the \halign is over. The last cell's scope still needs to
            // be closed.
            if (cellScope.isHalignCell) {
              // Before any of the cell closing happens, the preamble for the previous cell needs
              // to be added in to be parsed. The preamble-adding part is copied from where a-
              // lignment tokens are parsed.
              if (!this.postPreamble) {
                var column = -1,
                  tokens;
                for (var i = 0, l = row.length; i < l; i++) {
                  column += row[i].span;
                }
  
                if (halignScope.preamble[column]) {
                  tokens = halignScope.preamble[column][1];
                } else if (~halignScope.repeatPreambleAt) {
                  var repeatable = halignScope.preamble.slice(halignScope.repeatPreambleAt, halignScope.preamble.length);
                  tokens = repeatable[(column - halignScope.repeatPreambleAt) % repeatable.length][1];
                } else {
                  this.invalid = true;
                  return [this];
                }
                // The preamble tokens should be cloned to prevent some of the from only being able
                // to be parsed once.
                var preambleToks = [];
                for (var i = 0, l = tokens.length; i < l; i++) {
                  var token = {};
                  for (var key in tokens[i]) {
                    token[key] = tokens[i][key];
                  }
                  preambleToks.push(token);
                }
                this.postPreamble = true;
                return preambleToks.concat(this);
              }
  
              if (e.scopes.last().root) e.scopes.last().root.invalid = true;
  
              e.contexts.pop();
              var tokens = e.scopes.last().tokens;
              if (e.scopes.last().isFrac) {
                row[row.length - 1].content.push({
                  type: 'atom',
                  atomType: 'inner',
                  nucleus: [{
                    type: 'fraction',
                    numerator: e.scopes.last().fracNumerator,
                    denominator: tokens,
                    barWidth: e.scopes.last().barWidth,
                    delims: [e.scopes.last().fracLeftDelim, e.scopes.last().fracRightDelim],
                    nullDelimiterSpace: new DimenReg(e.scopes.last().registers.named.nulldelimiterspace)
                  }],
                  superscript: null,
                  subscript: null
                });
                e.scopes.pop();
              } else {
                e.scopes.pop();
                var row = e.scopes.last().cellData[e.scopes.last().cellData.length - 1];
                row[row.length - 1].content = row[row.length - 1].content.concat(tokens);
              }
            }
  
            var crNoAlignSym = Symbol(),
              noalign = false;
            e.mouth.saveState(crNoAlignSym);
  
            // The \cr is in the proper context. \noalign is looked for first.
            while (true) {
              var token = e.mouth.eat();
  
              if (!token) {
                e.mouth.loadState(crNoAlignSym);
                e.scopes.last().noAligns.push(null);
                break;
              } else if (token.type == 'character' && token.cat != catcodes.ACTIVE) {
                e.mouth.loadState(crNoAlignSym);
                e.scopes.last().noAligns.push(null);
                break;
              } else if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
                // If it's a register, it's not a \noalign, so break the loop.
                if (token.name in e.scopes.last().registers.named) {
                  e.mouth.loadState(crNoAlignSym);
                  e.scopes.last().noAligns.push(null);
                  break;
                }
  
                var macro = token.type == 'command' ? e.scopes.last().defs.primitive[token.name] || e.scopes.last().defs.macros[token.name] : e.scopes.last().defs.active[token.char];
  
                if (!macro) {
                  e.mouth.loadState(crNoAlignSym);
                  e.scopes.last().noAligns.push(null);
                  break;
                }
                // If an expandable primitive is found, expand it to get some tokens.
                if ((macro === data.defs.primitive.the          || macro.proxy && macro.original === data.defs.primitive.the)          ||
                  (macro === data.defs.primitive.expandafter  || macro.proxy && macro.original === data.defs.primitive.expandafter)  ||
                  (macro === data.defs.primitive.number       || macro.proxy && macro.original === data.defs.primitive.number)       ||
                  (macro === data.defs.primitive.romannumeral || macro.proxy && macro.original === data.defs.primitive.romannumeral) ||
                  (macro === data.defs.primitive.csname       || macro.proxy && macro.original === data.defs.primitive.csname)       ||
                  (macro === data.defs.primitive.string       || macro.proxy && macro.original === data.defs.primitive.string)       ||
                  (macro === data.defs.primitive.if           || macro.isLet && macro.original === data.defs.primitive.if)           ||
                  (macro === data.defs.primitive.ifcase       || macro.isLet && macro.original === data.defs.primitive.ifcase)       ||
                  (macro === data.defs.primitive.ifcat        || macro.isLet && macro.original === data.defs.primitive.ifcat)        ||
                  (macro === data.defs.primitive.ifdim        || macro.isLet && macro.original === data.defs.primitive.ifdim)        ||
                  (macro === data.defs.primitive.ifeof        || macro.isLet && macro.original === data.defs.primitive.ifeof)        ||
                  (macro === data.defs.primitive.iffalse      || macro.isLet && macro.original === data.defs.primitive.iffalse)      ||
                  (macro === data.defs.primitive.ifodd        || macro.isLet && macro.original === data.defs.primitive.ifodd)        ||
                  (macro === data.defs.primitive.ifnum        || macro.isLet && macro.original === data.defs.primitive.ifnum)        ||
                  (macro === data.defs.primitive.ifhmode      || macro.isLet && macro.original === data.defs.primitive.ifhmode)      ||
                  (macro === data.defs.primitive.ifinner      || macro.isLet && macro.original === data.defs.primitive.ifinner)      ||
                  (macro === data.defs.primitive.ifmmode      || macro.isLet && macro.original === data.defs.primitive.ifmmode)      ||
                  (macro === data.defs.primitive.iftrue       || macro.isLet && macro.original === data.defs.primitive.iftrue)       ||
                  (macro === data.defs.primitive.ifvmode      || macro.isLet && macro.original === data.defs.primitive.ifvmode)      ||
                  (macro === data.defs.primitive.ifvoid       || macro.isLet && macro.original === data.defs.primitive.ifvoid)       ||
                  (macro === data.defs.primitive.ifx          || macro.isLet && macro.original === data.defs.primitive.ifx)) {
                  var expansion = e.mouth.expand(token, e.mouth);
                  if (expansion.length == 1 && expansion[0] === token && token.invalid) {
                    e.mouth.loadState(crNoAlignSym);
                    e.scopes.last().noAligns.push(null);
                    break;
                  }
                  e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
                  continue;
                } else if (macro === data.defs.primitive.noalign || macro.proxy && macro.original === data.defs.primitive.noalign) {
                  // Now that a \noalign was found, the next token has to be an opening token. Other-
                  // wise, the \noalign is considered invalid.
                  var preview = e.mouth.preview();
                  if (preview.cat != catcodes.OPEN) {
                    e.mouth.loadState(crNoAlignSym);
                    e.scopes.last().noAligns.push(null);
                  } else {
                    noalign = true;
                  }
                  break;
                }
  
                if (macro.type == 'primitive' || macro.proxy && macro.original.type == 'primitive') {
                  e.mouth.loadState(crNoAlignSym);
                  e.scopes.last().noAligns.push(null);
                  break;
                }
  
                var expansion = e.mouth.expand(token, e.mouth);
                if (expansion.length == 1 && expansion[0] ==- token && token.invalid) {
                  e.mouth.loadState(crNoAlignSym);
                  e.scopes.last().noAligns.push(null);
                  break;
                }
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              }
            }
  
            var crcrSym = Symbol();
            e.mouth.saveState(crcrSym);
  
            // If a \crcr is found after a \cr or \noalign, it is skipped over and ignored.
            // It's more convenient to handle the ignoring part here, and just treat \crcr like
            // a regular \cr in other situations. /crcr is looked for like above with \noalign.
            while (true) {
              var token = e.mouth.eat();
  
              if (!token) {
                e.mouth.loadState(crcrSym);
                break;
              } else if (token.type == 'character' && token.cat != catcodes.ACTIVE) {
                e.mouth.loadState(crcrSym);
                break;
              } else if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
                if (token.name in e.scopes.last().registers.named) {
                  e.mouth.loadState(crcrSym);
                  break;
                }
  
                var macro = token.type == 'command' ? e.scopes.last().defs.primitive[token.name] || e.scopes.last().defs.macros[token.name] : e.scopes.last().defs.active[token.char];
  
                if (!macro) {
                  e.mouth.loadState(crcrSym);
                  break;
                }
                // If an expandable primitive is found, expand it to get some tokens.
                if ((macro === data.defs.primitive.the          || macro.proxy && macro.original === data.defs.primitive.the)          ||
                  (macro === data.defs.primitive.expandafter  || macro.proxy && macro.original === data.defs.primitive.expandafter)  ||
                  (macro === data.defs.primitive.number       || macro.proxy && macro.original === data.defs.primitive.number)       ||
                  (macro === data.defs.primitive.romannumeral || macro.proxy && macro.original === data.defs.primitive.romannumeral) ||
                  (macro === data.defs.primitive.csname       || macro.proxy && macro.original === data.defs.primitive.csname)       ||
                  (macro === data.defs.primitive.string       || macro.proxy && macro.original === data.defs.primitive.string)       ||
                  (macro === data.defs.primitive.if           || macro.isLet && macro.original === data.defs.primitive.if)           ||
                  (macro === data.defs.primitive.ifcase       || macro.isLet && macro.original === data.defs.primitive.ifcase)       ||
                  (macro === data.defs.primitive.ifcat        || macro.isLet && macro.original === data.defs.primitive.ifcat)        ||
                  (macro === data.defs.primitive.ifdim        || macro.isLet && macro.original === data.defs.primitive.ifdim)        ||
                  (macro === data.defs.primitive.ifeof        || macro.isLet && macro.original === data.defs.primitive.ifeof)        ||
                  (macro === data.defs.primitive.iffalse      || macro.isLet && macro.original === data.defs.primitive.iffalse)      ||
                  (macro === data.defs.primitive.ifodd        || macro.isLet && macro.original === data.defs.primitive.ifodd)        ||
                  (macro === data.defs.primitive.ifnum        || macro.isLet && macro.original === data.defs.primitive.ifnum)        ||
                  (macro === data.defs.primitive.ifhmode      || macro.isLet && macro.original === data.defs.primitive.ifhmode)      ||
                  (macro === data.defs.primitive.ifinner      || macro.isLet && macro.original === data.defs.primitive.ifinner)      ||
                  (macro === data.defs.primitive.ifmmode      || macro.isLet && macro.original === data.defs.primitive.ifmmode)      ||
                  (macro === data.defs.primitive.iftrue       || macro.isLet && macro.original === data.defs.primitive.iftrue)       ||
                  (macro === data.defs.primitive.ifvmode      || macro.isLet && macro.original === data.defs.primitive.ifvmode)      ||
                  (macro === data.defs.primitive.ifvoid       || macro.isLet && macro.original === data.defs.primitive.ifvoid)       ||
                  (macro === data.defs.primitive.ifx          || macro.isLet && macro.original === data.defs.primitive.ifx)) {
                  var expansion = e.mouth.expand(token, e.mouth);
                  if (expansion.length == 1 && expansion[0] === token && token.invalid) {
                    e.mouth.loadState(crcrSym);
                    break;
                  }
                  e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
                  continue;
                } else if (macro === data.defs.primitive.crcr || macro.proxy && macro.original === data.defs.primitive.crcr) {
                  break;
                }
  
                if (macro.type == 'primitive' || macro.proxy && macro.original.type == 'primitive') {
                  e.mouth.loadState(crcrSym);
                  break;
                }
  
                var expansion = e.mouth.expand(token, e.mouth);
                if (expansion.length == 1 && expansion[0] ==- token && token.invalid) {
                  e.mouth.loadState(crcrSym);
                  break;
                }
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              }
            }
  
            var crCloseSym = Symbol();
            e.mouth.saveState(crCloseSym);
  
            // After a \cr or \noalign, if there's a closing token, it signifies the end of the
            // \halign table. Instead of making a new row, the table scope is closed.
            while (true) {
              var token = e.mouth.eat();
  
              if (!token) {
                e.mouth.loadState(crCloseSym);
                break;
              } else if (token.type == 'character' && token.cat == catcodes.CLOSE) {
                // A closing character was found, signifying the end of the table. First though,
                // the tabskip array has to be expanded. If the preamble was set to repeat, then
                // the tabskip definitions inside them must also repeat. Now that we have the full
                // table, we can find the longest row according to the amount of cells. With that,
                // the tabskip array can repeat itself such that it'll be the correct length.
                var halignScope = e.scopes.last();
                if (~halignScope.repeatPreambleAt) {
                  var longest = Math.max.apply(Math, halignScope.cellData.map(function(row) {
                    var span = 0;
                    for (var i = 0, l = row.length; i < l; i++) {
                      span += row[i].span;
                    }
                    return span;
                  }));
                  var repeat = halignScope.tabSkips.slice(halignScope.repeatPreambleAt + 1, halignScope.tabSkips.length),
                    index = 0;
                  while (halignScope.tabSkips.length < longest + 1) {
                    halignScope.tabSkips.push(repeat[index]);
                    index = (index + 1) % repeat.length;
                  }
                }
                e.scopes.pop();
                e.scopes.last().tokens.push({
                  type: 'atom',
                  atomType: 'inner',
                  nucleus: [{
                    type: 'table',
                    cellData: halignScope.cellData,
                    tabSkips: halignScope.tabSkips,
                    noAligns: halignScope.noAligns
                  }],
                  superscript: null,
                  subscript: null
                });
                return [];
              } else if (token.type == 'character' && token.cat != catcodes.ACTIVE) {
                e.mouth.loadState(crCloseSym);
                break;
              } else if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
                if (token.name in e.scopes.last().registers.named) {
                  e.mouth.loadState(crCloseSym);
                  break;
                }
  
                var macro = token.type == 'command' ? e.scopes.last().defs.primitive[token.name] || e.scopes.last().defs.macros[token.name] : e.scopes.last().defs.active[token.char];
  
                if (!macro) {
                  e.mouth.loadState(crCloseSym);
                  break;
                }
                // If an expandable primitive is found, expand it to get some tokens.
                if ((macro === data.defs.primitive.the          || macro.proxy && macro.original === data.defs.primitive.the)          ||
                  (macro === data.defs.primitive.expandafter  || macro.proxy && macro.original === data.defs.primitive.expandafter)  ||
                  (macro === data.defs.primitive.number       || macro.proxy && macro.original === data.defs.primitive.number)       ||
                  (macro === data.defs.primitive.romannumeral || macro.proxy && macro.original === data.defs.primitive.romannumeral) ||
                  (macro === data.defs.primitive.csname       || macro.proxy && macro.original === data.defs.primitive.csname)       ||
                  (macro === data.defs.primitive.string       || macro.proxy && macro.original === data.defs.primitive.string)       ||
                  (macro === data.defs.primitive.if           || macro.isLet && macro.original === data.defs.primitive.if)           ||
                  (macro === data.defs.primitive.ifcase       || macro.isLet && macro.original === data.defs.primitive.ifcase)       ||
                  (macro === data.defs.primitive.ifcat        || macro.isLet && macro.original === data.defs.primitive.ifcat)        ||
                  (macro === data.defs.primitive.ifdim        || macro.isLet && macro.original === data.defs.primitive.ifdim)        ||
                  (macro === data.defs.primitive.ifeof        || macro.isLet && macro.original === data.defs.primitive.ifeof)        ||
                  (macro === data.defs.primitive.iffalse      || macro.isLet && macro.original === data.defs.primitive.iffalse)      ||
                  (macro === data.defs.primitive.ifodd        || macro.isLet && macro.original === data.defs.primitive.ifodd)        ||
                  (macro === data.defs.primitive.ifnum        || macro.isLet && macro.original === data.defs.primitive.ifnum)        ||
                  (macro === data.defs.primitive.ifhmode      || macro.isLet && macro.original === data.defs.primitive.ifhmode)      ||
                  (macro === data.defs.primitive.ifinner      || macro.isLet && macro.original === data.defs.primitive.ifinner)      ||
                  (macro === data.defs.primitive.ifmmode      || macro.isLet && macro.original === data.defs.primitive.ifmmode)      ||
                  (macro === data.defs.primitive.iftrue       || macro.isLet && macro.original === data.defs.primitive.iftrue)       ||
                  (macro === data.defs.primitive.ifvmode      || macro.isLet && macro.original === data.defs.primitive.ifvmode)      ||
                  (macro === data.defs.primitive.ifvoid       || macro.isLet && macro.original === data.defs.primitive.ifvoid)       ||
                  (macro === data.defs.primitive.ifx          || macro.isLet && macro.original === data.defs.primitive.ifx)) {
                  var expansion = e.mouth.expand(token, e.mouth);
                  if (expansion.length == 1 && expansion[0] === token && token.invalid) {
                    e.mouth.loadState(crCloseSym);
                    break;
                  }
                  e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
                  continue;
                }
  
                if (macro.type == 'primitive' || macro.proxy && macro.original.type == 'primitive') {
                  e.mouth.loadState(crCloseSym);
                  break;
                }
  
                var expansion = e.mouth.expand(token, e.mouth);
                if (expansion.length == 1 && expansion[0] ==- token && token.invalid) {
                  e.mouth.loadState(crCloseSym);
                  break;
                }
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              }
            }
  
            var crOmitSym = Symbol();
            e.mouth.saveState(crOmitSym);
  
            // Now, add the new row and cell to the scope.
            e.scopes.last().cellData.push([{
              type: 'cell',
              content: [],
              omit: false,
              span: 1
            }]);
  
            // Look for \omit the same way as \noalign.
            while (true) {
              var token = e.mouth.eat();
  
              if (!token) {
                e.mouth.loadState(crOmitSym);
                break;
              } else if (token.type == 'character' && token.cat != catcodes.ACTIVE) {
                e.mouth.loadState(crOmitSym);
                break;
              } else if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
                if (token.name in e.scopes.last().registers.named) {
                  e.mouth.loadState(crOmitSym);
                  break;
                }
  
                var macro = token.type == 'command' ? e.scopes.last().defs.primitive[token.name] || e.scopes.last().defs.macros[token.name] : e.scopes.last().defs.active[token.char];
  
                if (!macro) {
                  e.mouth.loadState(crOmitSym);
                  break;
                }
                if ((macro === data.defs.primitive.the          || macro.proxy && macro.original === data.defs.primitive.the)          ||
                  (macro === data.defs.primitive.expandafter  || macro.proxy && macro.original === data.defs.primitive.expandafter)  ||
                  (macro === data.defs.primitive.number       || macro.proxy && macro.original === data.defs.primitive.number)       ||
                  (macro === data.defs.primitive.romannumeral || macro.proxy && macro.original === data.defs.primitive.romannumeral) ||
                  (macro === data.defs.primitive.csname       || macro.proxy && macro.original === data.defs.primitive.csname)       ||
                  (macro === data.defs.primitive.string       || macro.proxy && macro.original === data.defs.primitive.string)       ||
                  (macro === data.defs.primitive.if           || macro.isLet && macro.original === data.defs.primitive.if)           ||
                  (macro === data.defs.primitive.ifcase       || macro.isLet && macro.original === data.defs.primitive.ifcase)       ||
                  (macro === data.defs.primitive.ifcat        || macro.isLet && macro.original === data.defs.primitive.ifcat)        ||
                  (macro === data.defs.primitive.ifdim        || macro.isLet && macro.original === data.defs.primitive.ifdim)        ||
                  (macro === data.defs.primitive.ifeof        || macro.isLet && macro.original === data.defs.primitive.ifeof)        ||
                  (macro === data.defs.primitive.iffalse      || macro.isLet && macro.original === data.defs.primitive.iffalse)      ||
                  (macro === data.defs.primitive.ifodd        || macro.isLet && macro.original === data.defs.primitive.ifodd)        ||
                  (macro === data.defs.primitive.ifnum        || macro.isLet && macro.original === data.defs.primitive.ifnum)        ||
                  (macro === data.defs.primitive.ifhmode      || macro.isLet && macro.original === data.defs.primitive.ifhmode)      ||
                  (macro === data.defs.primitive.ifinner      || macro.isLet && macro.original === data.defs.primitive.ifinner)      ||
                  (macro === data.defs.primitive.ifmmode      || macro.isLet && macro.original === data.defs.primitive.ifmmode)      ||
                  (macro === data.defs.primitive.iftrue       || macro.isLet && macro.original === data.defs.primitive.iftrue)       ||
                  (macro === data.defs.primitive.ifvmode      || macro.isLet && macro.original === data.defs.primitive.ifvmode)      ||
                  (macro === data.defs.primitive.ifvoid       || macro.isLet && macro.original === data.defs.primitive.ifvoid)       ||
                  (macro === data.defs.primitive.ifx          || macro.isLet && macro.original === data.defs.primitive.ifx)) {
                  var expansion = e.mouth.expand(token, e.mouth);
                  if (expansion.length == 1 && expansion[0] === token && token.invalid) {
                    e.mouth.loadState(crOmitSym);
                    break;
                  }
                  e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
                  continue;
                } else if (macro === data.defs.primitive.omit || macro.proxy && macro.original === data.defs.primitive.omit) {
                  e.scopes.last().cellData[e.scopes.last().cellData.length - 1][0].omit = true;
                  break;
                }
  
                if (macro.type == 'primitive' || macro.proxy && macro.original.type == 'primitive') {
                  e.mouth.loadState(crOmitSym);
                  break;
                }
  
                var expansion = e.mouth.expand(token, e.mouth);
                if (expansion.length == 1 && expansion[0] ==- token && token.invalid) {
                  e.mouth.loadState(crOmitSym);
                  break;
                }
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              }
            }
  
            // Open a new scope for the new cell.
            var halignScope = e.scopes.last();
            e.contexts.push({
              toString: () => 'scope',
              type: "scope"
            });
            new e.Scope();
            e.scopes.last().isHalignCell = true;
            e.scopes.last().noAligned = noalign;
  
            // If the cell wasn't marked as `omit', the preamble for the new column needs to be
            // evaluated. The tokens are cloned first so that they can be reused.
            if (halignScope.cellData[halignScope.cellData.length - 1][0].omit) return [];
            var tokens = halignScope.preamble[0][0],
              preambleToks = [];
            for (var i = 0, l = tokens.length; i < l; i++) {
              var token = {};
              for (var key in tokens[i]) {
                token[key] = tokens[i][key];
              }
              preambleToks.push(token);
            }
            return preambleToks;
          }),
          crcr: new Primitive("crcr", null), // Set to match \cr's function later
          csname: new Primitive('csname', function(e) {
            // \csname is used for dynamic command named. Everything after \csname up to the
            // first instance of \endcsname is recursively expanded until only characters
            // remain. Then, all the characters are gathered up and compiled into a single
            // command token with that name.
  
            var csnameSym = Symbol();
            e.mouth.saveState(csnameSym);
  
            // This array stores all the tokens that are going to be used in the command name.
            var name = [];
            while (true) {
              // Tokens are continuously eaten until a \endcsname is found.
              var token = e.mouth.eat('pre space');
  
              if (!token) {
                this.invalid = true;
                e.mouth.loadState(csnameSym);
                return [this];
              } else if (name.length == 0 && token.cat == catcodes.WHITESPACE) {
                // If a whitespace character is found immediately after the \csname, it has to be
                // ignored. Normally, this is done automatically by not using the "pre space" con-
                // text, but it has to be used in this case because whitespace is kept later on.
                // If there are already tokens in `name', it means the whitespace doesn't immedi-
                // ately follow the \csname, so it has to be counted.
                continue;
              } else if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
                // If the command refers to a register, the whole thing is made invalid since reg-
                // isters can't be turned into characters by themselves.
                if (token.name in e.scopes.last().registers.named) {
                  this.invalid = true;
                  e.mouth.loadState(csnameSym);
                  return [this];
                }
                // A macro or active character was found. Look up its definition first.
                var macro = token.type == 'command' ? e.scopes.last().defs.primitive[token.name] || e.scopes.last().defs.macros[token.name] : e.scopes.last().defs.active[token.char];
                // If it doesn't have a definition, return invalid.
                if (!macro) {
                  this.invalid = true;
                  e.mouth.loadState(csnameSym);
                  return [this];
                }
  
                // If the macro is a proxy (\let), get the original.
                if (macro.proxy) macro = macro.original;
  
                // If the macro is \endcsname, the whole thing ends and whatever was gotten so far
                // is counted as the name.
                if (macro === data.defs.primitive.endcsname) {
                  break;
                } else if (
                  macro === data.defs.primitive.the          ||
                  macro === data.defs.primitive.expandafter  ||
                  macro === data.defs.primitive.number       ||
                  macro === data.defs.primitive.romannumeral ||
                  macro === data.defs.primitive.csname       ||
                  macro === data.defs.primitive.string       ||
                  macro === data.defs.primitive.if           ||
                  macro === data.defs.primitive.ifcase       ||
                  macro === data.defs.primitive.ifcat        ||
                  macro === data.defs.primitive.ifdim        ||
                  macro === data.defs.primitive.ifeof        ||
                  macro === data.defs.primitive.iffalse      ||
                  macro === data.defs.primitive.ifodd        ||
                  macro === data.defs.primitive.ifnum        ||
                  macro === data.defs.primitive.ifhmode      ||
                  macro === data.defs.primitive.ifinner      ||
                  macro === data.defs.primitive.ifmmode      ||
                  macro === data.defs.primitive.iftrue       ||
                  macro === data.defs.primitive.ifvmode      ||
                  macro === data.defs.primitive.ifvoid       ||
                  macro === data.defs.primitive.ifx) {
                  var expansion = e.mouth.expand(token, e.mouth);
                  if (expansion.length == 1 && expansion[0] === token && expansion[0].invalid) {
                    this.invalid = true;
                    e.mouth.loadState(csnameSym);
                    return [this];
                  }
                  e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
                  continue;
                } else if (macro instanceof Primitive) {
                  // If the macro is a nonexpandable primitive, it's marked as invalid.
                  this.invalid = true;
                  e.mouth.loadState(csnameSym);
                  return [this];
                }
  
                // If it's a normal macro, it's expanded.
                var expansion = e.mouth.expand(token, e.mouth);
                if (expansion.length == 1 && expansion[0] === token && expansion[0].invalid) {
                  this.invalid = true;
                  e.mouth.loadState(csnameSym);
                  return [this];
                }
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              } else name.push(token);
            }
            return [{
              type: 'command',
              nameType: 'command',
              escapeChar: String.fromCharCode(e.scopes.last().registers.named.escapechar.value),
              name: name.map(function(token) {
                return token.char;
              }).join('')
            }];
          }),
          day: new Primitive('day', function(e) {
            // Returns the current day of the month in the range [1,31].
  
            return [new IntegerReg(new Date().getDate())];
          }),
          def: new Primitive('def', function(e) {
            // \def is able to define new macros. The syntax is \def[command name][parameters]
            // [replacement text]. [command name] is either a command prefixed with an escape
            // character, or a regular character with catcode 13 (active character). After that
            // are [parameters]. This is a list of tokens that don't get expanded. Parameter
            // tokens act as placeholders for tokens that can be used as arguments for the
            // [replacement text]. [replacement text] start with an opening character (catcode
            // 1) and ends in a closing character (catcode 2).
  
            // \def isn't allowed after superscript or subscript.
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            // First, save the state of the mouth in case an error occurs.
            var defSym = Symbol();
            e.mouth.saveState(defSym);
  
            // The first token should bet the name of the macro.
            var name = e.mouth.eat();
            if (!name) {
              // If there was no token found, the current token is invalid.
              this.invalid = true;
              return [this];
            }
            var type;
            if (name.type == 'character') {
              // The macro's name is a single character. Make sure it's catcode 13.
              if (e.catOf(name.char) == catcodes.ACTIVE) {
                // The character is an active character.
                type = 'active';
                name = name.char;
              } else {
                this.invalid = true;
                e.mouth.loadState(defSym);
                return [this];
              }
            } else if (name.type == 'command') {
              // The macro is a command.
              type = 'macro';
              name = name.name;
              // Make sure it's not overriding any primitives or built-in parameters.
              if (name in e.scopes.last().defs.primitive || data.parameters.includes(name)) {
                this.invalid = true;
                e.mouth.loadState(defSym);
                return [this];
              }
            }
  
            // The name of the macro has been determined at this point. Now look for parameter
            // tokens.
  
            // This array will be the list of parameter tokens to store with the command. Every
            // call to the command must follow this set of parameter tokens to be considered a
            // valid call.
            var params = [];
  
            // This number just keeps track of which parameters have already been used since
            // they need to be ordered consecutively.
            var used = 0;
  
            // In TeX, if you end a command's parameters in a parameter token, like in this
            // string: "\def\cmd#{test}", then the opening token is added to the parameter
            // list and the replacement text. `endInOpen' keeps track of that.
            var endInOpen = false;
  
            while (true) {
              // Tokens are sequentially eaten until the first opening token is found (catcode
              // 1). At that point, the parameter tokens are done and the replacement text will
              // start to be absorbed.
              var token = e.mouth.eat();
  
              if (!token) {
                // If there are no more tokens, then replacement tokens weren't found, which makes
                // this \def invalid.
                this.invalid = true;
                e.mouth.loadState(defSym);
                return [this];
              } else if (token.cat == catcodes.OPEN) {
                // The first opening token was found. The token should be returned and the para-
                // meter tokens are done parsing.
                e.mouth.revert();
                break;
              } else if (token.cat == catcodes.PARAMETER) {
                // A parameter token was found. The next token should either be a number or an o-
                // pening token.
  
                var paramTok = e.mouth.eat('pre space');
  
                if (!paramTok) {
                  // No token was found. The command is invalid.
                  this.invalid = true;
                  e.mouth.loadState(defSym);
                  return [this];
                } else if (paramTok.cat == catcodes.OPEN) {
                  // An opening token follows the parameter. Mark `endInOpen' as true, return the
                  // token, and continue.
                  endInOpen = true;
                  e.mouth.revert();
                  params.push({
                    type: 'character',
                    cat: catcodes.OPEN,
                    char: paramTok.char,
                    code: paramTok.code
                  });
                } else if (48 < paramTok.code && paramTok.code < 58 && paramTok.cat == catcodes.OTHER && +paramTok.char == used + 1) {
                  // A number was found that references the index of the parameter. Add a regular
                  // parameter token and discard the number token.
                  params.push(token);
                  used++;
                } else {
                  // Some other token was found after the parameter token. That make the \def command
                  // call invalid.
                  this.invalid = true;
                  e.mouth.loadState(defSym);
                  return [this];
                }
              } else {
                // A regular character was found. Add it to `params' and continue.
                params.push(token);
              }
            }
  
            // All the parameters have been found. Now, the replacement text needs to be looked
            // for.
  
            // Unbalanced groups are not allowed in the parameter text. This keeps track of how
            // many group are open that still need to be closed.
            var openGroups = 0;
  
            // This is where all the tokens go. These are the tokens that are used as the re-
            // placement text.
            var replacement = [];
  
            // For double parameter tokens, the second needs to be skipped.
            var skip = false;
  
            while (true) {
              var token = e.mouth.eat('pre space');
  
              if (!token) {
                // The replacement text was never closed. Make this command invalid.
                this.invalid = true;
                e.mouth.loadState(defSym);
                return [this];
              } else if (token.type == 'character' && token.cat == catcodes.PARAMETER && !skip) {
                // If a parameter token is found in the definition, it must be followed by a number
                // corresponding to a parameter index or another parameter token. If it's not fol-
                // lowed by either of those, the whole thing is marked invalid.
                var index = e.mouth.eat('pre space');
                if (index && (index.cat == catcodes.PARAMETER || (index.cat == catcodes.OTHER && index.char <= params.length && index.char >= 1))) {
                  // Even though it passed the test, the number still needs to be returned so that
                  // it'll be included in the definition.
                  e.mouth.revert();
                  if (index.cat == catcodes.PARAMETER) skip = true;
                } else {
                  this.invalid = true;
                  e.mouth.loadState(defSym);
                  return [this];
                }
              } else if (token.type == 'character' && token.cat == catcodes.OPEN) {
                // A new group is being opened. It must be closed before the replacement text can
                // finish parsing.
                openGroups++;
              } else if (token.type == 'character' && token.cat == catcodes.CLOSE) {
                // A closing token was found. It is either closing a group that was previously
                // opened, or its ending the replacement text.
                openGroups--;
                if (openGroups == 0) break;
              } else if (skip) skip = false;
              replacement.push(token);
            }
            // Remove the first opening token.
            replacement.shift();
  
            // If `endInOpen' is true, then an additional opening token should be added to the
            // replacement text.
            if (endInOpen) replacement.push(params[params.length - 1]);
  
  
            // This is the object that will be stored. It holds all the data needed to execute
            // a macro.
            var macro = new Macro(replacement, params);
  
            // All the parsing is done now. All that's left is to store the command.
            if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
              // There was a \global. The definition should affect all scopes.
              if (type == 'macro') {
                // Change the original scope stored at `data'.
                data.defs.macros[name] = macro;
  
                // Delete any named register with the name of the macro.
                delete data.registers.named[name];
  
                // All existing scopes also need to be changed too.
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].defs.macros[name] = macro;
                  delete e.scopes[i].registers[name];
                }
              } else {
                data.defs.active[name] = macro;
                delete data.registers.named[name];
  
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].defs.ative[name] = macro;
                  delete e.scopes[i].registers[name];
                }
              }
            } else {
              e.scopes.last().defs[type == 'macro' ? 'macros' : 'active'][name] = macro;
              delete e.scopes.last().registers.named[name];
            }
  
            e.toggles.global = false;
  
            return [];
          }),
          dimen: new Primitive('dimen', function(e) {
            // Returns the dimension register at the specified index.
  
            var dimen = e.mouth.eat('integer');
            if (!dimen || dimen.value < 0) {
              this.invalid = true;
              return [this];
            }
            if (!data.registers.dimen[dimen.value]) {
              data.registers.dimen[dimen.value] = new DimenReg(0, 0);
              for (var i = 0, l = e.scopes.length; i < l; i++) {
                e.scopes[i].registers.dimen[dimen.value] = new DimenReg((i ? e.scopes[i - 1] : data).registers.dimen[dimen.value]);
              }
            }
            return [e.scopes.last().registers.dimen[dimen.value]];
          }),
          dimendef: new Primitive('dimendef', function(e) {
            // Dimension version of \countdef.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var dimenDefSym = Symbol();
            e.mouth.saveState(dimenDefSym);
            var name = e.mouth.eat();
  
            if (name.type == 'command') {
              if (name.name in data.defs.primitive || name.name in data.parameters) {
                this.invalid = true;
                e.mouth.loadState(dimenDefSym);
                return [true];
              }
              var optEquals = e.mouth.eat();
              if (!optEquals || optEquals.type != 'character' || optEquals.char != '=' || optEquals.cat != catcodes.OTHER) optEquals && e.mouth.revert();
              var integer = e.mouth.eat('integer');
              if (!integer || integer.value < 0) {
                this.invalid = true;
                e.mouth.loadState(dimenDefSym);
                return [true];
              }
              name = name.name;
              integer = integer.value;
              if (!data.registers.dimen[integer]) {
                data.registers.dimen[integer] = new DimenReg(0, 0);
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].registers.dimen[integer] = new DimenReg((i ? e.scopes[i - 1] : data).registers.dimen[integer]);
                }
              }
              if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
                data.registers.named[name] = data.registers.dimen[integer];
                delete data.defs.macros[name];
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].registers.named[name] = e.scopes[i].registers.dimen[integer];
                  delete e.scopes[i].defs.macros[name];
                }
              } else {
                e.scopes.last().registers.named[name] = e.scopes.last().registers.dimen[integer];
                delete e.scopes.last().defs.macros[name];
              }
            } else {
              this.invalid = true;
              e.mouth.loadState(countDefSym);
              return [true];
            }
          }),
          displaylimits: new Primitive('displaylimits', function(e) {
            // \displaylimits controls where superscripts and subscripts are displayed. If the
            // current style is in display mode (even if it was changed via a \displaystyle
            // command), then the superscripts and subscripts are rendered above and below the
            // previous Op(erator) atom, respectively. A temporary token is added that will be
            // resolved later (once the \displaystyle commands have been taken into account).
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'limit modifier',
              value: 'display',
              token: this
            });
            return [];
          }),
          displaystyle: new Primitive('displaystyle', function(e) {
            // \displaystyle makes all the characters in the rest of the scope appear as a dis-
            // played equation.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'font modifier',
              value: 'displaystyle'
            });
            return [];
          }),
          divide: new Primitive('divide', function(e) {
            // \divide divides a register by a specified value.
  
            if (e.contexts.last == "superscript" || e.contexts.last == "subscript") {
              this.invalid = true;
              return [this];
            }
  
            let divideSym = Symbol();
            e.mouth.saveState(divideSym);
  
            while (true) {
              let register = e.mouth.eat();
  
              if (register && (register.type == "command" || register.type == "character" &&
                  register.cat == catcodes.ACTIVE)) {
                let expansion = e.mouth.expand(register, e.mouth);
  
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              } else if (register && register.register) {
                if (register && register.register) {
                  let token = e.mouth.eat();
  
                  if (token && token.type == "character" && (token.char == "b" || token.char == "B")
                      && token.cat != catcodes.ACTIVE) {
                    var y = e.mouth.eat();
                    if (!(y && y.type == 'character' && (y.char == 'y' || y.char == 'Y') && y.cat != catcodes.ACTIVE)) e.mouth.revert(2);
                  } else if (token) e.mouth.revert();
                  else {
                    this.invalid = true;
                    e.mouth.loadState(divideSym);
                    return [this];
                  }
  
                  var divisor = e.mouth.eat('integer');
  
                  if (divisor) {
                    if (register.type == 'integer') {
                      register.value = ~~(register.value / divisor.value);
                      var reg = register;
                      if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
                        while (register.parent) {
                          register = register.parent;
                          register.value = reg.value;
                        }
                      }
                      e.toggles.global = false;
                    } else if (register.type == 'dimension') {
                      register.sp.value = ~~(register.sp.value / divisor.value);
                      register.em.value = ~~(register.em.value / divisor.value);
                      var reg = register;
                      if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
                        while (register.parent) {
                          register = register.parent;
                          register.sp.value = reg.sp.value;
                          register.em.value = reg.em.value;
                        }
                      }
                      e.toggles.global = false;
                    } else if (register.type == 'mu dimension') {
                      register.mu.value = ~~(register.mu.value / divisor.value);
                      var reg = register;
                      if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
                        while (register.parent) {
                          register = register.parent;
                          register.mu.value = reg.mu.value;
                        }
                      }
                      e.toggles.global = false;
                    } else if (register.type == 'glue') {
                      register.start.sp.value = ~~(register.start.sp.value / divisor.value);
                      register.start.em.value = ~~(register.start.em.value / divisor.value);
                      if (register.stretch.type == 'infinite dimension') register.stretch.number.value = ~~(register.stretch.number.value / divisor.value);
                      else {
                        register.stretch.sp.value = ~~(register.stretch.sp.value / divisor.value);
                        register.stretch.em.value = ~~(register.stretch.em.value / divisor.value);
                      }
                      if (register.shrink.type == 'infinite dimension') register.shrink.number.value = ~~(register.shrink.number.value / divisor.value);
                      else {
                        register.shrink.sp.value = ~~(register.shrink.sp.value / divisor.value);
                        register.shrink.em.value = ~~(register.shrink.em.value / divisor.value);
                      }
                      var reg = register;
                      if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
                        while (register.parent) {
                          register = register.parent;
                          register.start.sp.value = reg.start.sp.value;
                          register.start.em.value = reg.start.em.value;
                          if (reg.stretch.type == 'infinite dimension') register.stretch = new InfDimen(reg.stretch.number.value, reg.stretch.magnitude.value);
                          else register.stretch = new DimenReg(reg.stretch.sp.value, reg.stretch.em.value);
                          if (reg.shrink.type == 'infinite dimension') register.shrink = new InfDimen(reg.shrink.number.value, reg.shrink.magnitude.value);
                          else register.shrink = new DimenReg(reg.shrink.sp.value, reg.shrink.em.value);
                        }
                      }
                      e.toggles.global = false;
                    } else if (register.type == 'mu glue') {
                      register.start.mu.value = ~~(register.start.mu.value / divisor.value);
                      if (register.stretch.type == 'infinite dimension') register.stretch.number.value = ~~(register.stretch.number.value / divisor.value);
                      else register.stretch.mu.value = ~~(register.stretch.mu.value / divisor.value);
                      if (register.shrink.type == 'infinite dimension') register.shrink.number.value = ~~(register.shrink.number.value / divisor.value);
                      else register.shrink.mu.value = ~~(register.shrink.mu.value / divisor.value);
                      var reg = register;
                      if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
                        while (register.parent) {
                          register = register.parent;
                          register.start.mu.value = reg.start.mu.value;
                          if (reg.stretch.type == 'infinite dimension') register.stretch = new InfDimen(reg.stretch.number.value, reg.stretch.magnitude.value);
                          else register.stretch = new MuDimenReg(reg.stretch.mu.value);
                          if (reg.shrink.type == 'infinite dimension') register.shrink = new InfDimen(reg.shrink.number.value, reg.shrink.magnitude.value);
                          else register.shrink = new MuDimenReg(reg.shrink.mu.value);
                        }
                      }
                      e.toggles.global = false;
                    }
                  } else {
                    this.invalid = true;
                    e.mouth.loadState(divideSym);
                    return [this];
                  }
                  break;
                } else {
                  this.invalid = true;
                  e.mouth.loadState(divideSym);
                  return [this]
                }
              } else {
                this.invalid = true;
                e.mouth.loadState(divideSym);
                return [this];
              }
            }
            return [];
          }),
          edef: new Primitive('edef', function(e) {
            // \edef works kind of like \def. The parameters are found and absorbed like nor-
            // mal, but the tokens in the replacement text are expanded until only non-expand-
            // able characters remain. If a macro is encountered that requires a parameter, and
            // the parameter is a literal parameter token (#) (i.e. it should be replaced by
            // the \edef's parameters), then an error is raised. \edef has a weird behavior.
            // For example: \edef\cmd{\catcode`\f=\active}. You might expect everything in the
            // curly braces to be evaluated (like \edef claims to do), but primitives aren't
            // expanded. That means the \catcode command is skipped over. After that, a grave
            // character is found. Normally "`\f" would be interpreted as an integer (since it
            // is after \catcode), but it's not in this case because \catcode isn't evaluated.
            // Instead, the "\f" is interpreted as a command. If "\f" isn't defined, then an
            // error is raised, and the whole thing is made invalid. Even though it would work
            // outside of \edef, the tokens don't parse correctly. This is true even for real
            // TeX, so it's actually intended to act that way. If there's ever a case like that
            // above, it's better to just use regular \def.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var defSym = Symbol();
            e.mouth.saveState(defSym);
            var name = e.mouth.eat();
            if (!name) {
              this.invalid = true;
              return [this];
            }
            var type;
            if (name.type == 'character') {
              if (e.catOf(name.char) == catcodes.ACTIVE) {
                type = 'active';
                name = name.char;
              } else {
                this.invalid = true;
                e.mouth.loadState(defSym);
                return [this];
              }
            } else if (name.type == 'command') {
              type = 'macro';
              name = name.name;
              if (name in e.scopes.last().defs.primitive || name in data.parameters) {
                this.invalid = true;
                e.mouth.loadState(defSym);
                return [this];
              }
            }
            var params = [],
              used = 0,
              endInOpen = false;
            while (true) {
              var token = e.mouth.eat();
              if (!token) {
                this.invalid = true;
                e.mouth.loadState(defSym);
                return [this];
              } else if (token.cat == catcodes.OPEN) {
                e.mouth.revert();
                break;
              } else if (token.cat == catcodes.PARAMETER) {
                var paramTok = e.mouth.eat('pre space');
                if (!paramTok) {
                  this.invalid = true;
                  e.mouth.loadState(defSym);
                  return [this];
                } else if (paramTok.cat == catcodes.OPEN) {
                  endInOpen = true;
                  e.mouth.revert();
                  params.push({
                    type: 'character',
                    cat: catcodes.OPEN,
                    char: paramTok.char,
                    code: paramTok.code
                  })
                } else if (48 < paramTok.code && paramTok.code < 58 && paramTok.cat == catcodes.OTHER && +paramTok.char == used + 1) {
                  params.push(token);
                  used++;
                } else {
                  this.invalid = true;
                  e.mouth.loadState(defSym);
                  return [this];
                }
              } else params.push(token);
            }
            // If `noexpand' is true, the next token to be eaten is NOT expanded and is added
            // to `replacement' right away.
            var openGroups = 0,
              replacement = [],
              noexpand = false,
              skip = false;
            while (true) {
              // This is where the tokens are absorbed for the replacement text. If a macro or
              // active character is found, it is automatically expanded.
              var token = e.mouth.eat();
  
              if (!token) {
                this.invalid = true;
                e.mouth.loadState(defSym);
                return [this];
              } else if (token.type == 'character' && token.cat == catcodes.PARAMETER && !skip) {
                var index = e.mouth.eat('pre space');
                if (index && (index.cat == catcodes.PARAMETER || (index.cat == catcodes.OTHER && index.char <= params.length && index.char >= 1))) {
                  e.mouth.revert();
                  if (index.cat == catcodes.PARAMETER) skip = true;
                } else {
                  this.invalid = true;
                  e.mouth.loadState(defSym);
                  return [this];
                }
                replacement.push(token);
                noexpand = false;
              } else if (token.type == 'character' && token.cat == catcodes.OPEN) {
                openGroups++;
                replacement.push(token);
                noexpand = false;
              } else if (token.type == 'character' && token.cat == catcodes.CLOSE) {
                openGroups--;
                if (openGroups == 0) break;
                replacement.push(token);
                noexpand = false;
              } else if (noexpand) {
                replacement.push(token);
                noexpand = false;
              } else if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
                // If the command refers to a register, it should be added to the replacement and
                // continue.
                if (token.name in e.scopes.last().registers.named) {
                  replacement.push(token);
                  continue;
                }
                // A macro or active character was found. Look up its definition first.
                var macro = token.type == 'command' ? e.scopes.last().defs.primitive[token.name] || e.scopes.last().defs.macros[token.name] : e.scopes.last().defs.active[token.char];
                // If it doesn't have a definition, return invalid.
                if (!macro) {
                  this.invalid = true;
                  e.mouth.loadState(defSym);
                  return [this];
                }
                // Some primitives are actually expandable, like \the. If one of those special
                // primitives are found, they are called and expanded like normal.
                if ((macro === data.defs.primitive.the          || macro.proxy && macro.original === data.defs.primitive.the)          ||
                  (macro === data.defs.primitive.expandafter  || macro.proxy && macro.original === data.defs.primitive.expandafter)  ||
                  (macro === data.defs.primitive.number       || macro.proxy && macro.original === data.defs.primitive.number)       ||
                  (macro === data.defs.primitive.romannumeral || macro.proxy && macro.original === data.defs.primitive.romannumeral) ||
                  (macro === data.defs.primitive.csname       || macro.proxy && macro.original === data.defs.primitive.csname)       ||
                  (macro === data.defs.primitive.string       || macro.proxy && macro.original === data.defs.primitive.string)       ||
                  (macro === data.defs.primitive.if           || macro.isLet && macro.original === data.defs.primitive.if)           ||
                  (macro === data.defs.primitive.ifcase       || macro.isLet && macro.original === data.defs.primitive.ifcase)       ||
                  (macro === data.defs.primitive.ifcat        || macro.isLet && macro.original === data.defs.primitive.ifcat)        ||
                  (macro === data.defs.primitive.ifdim        || macro.isLet && macro.original === data.defs.primitive.ifdim)        ||
                  (macro === data.defs.primitive.ifeof        || macro.isLet && macro.original === data.defs.primitive.ifeof)        ||
                  (macro === data.defs.primitive.iffalse      || macro.isLet && macro.original === data.defs.primitive.iffalse)      ||
                  (macro === data.defs.primitive.ifodd        || macro.isLet && macro.original === data.defs.primitive.ifodd)        ||
                  (macro === data.defs.primitive.ifnum        || macro.isLet && macro.original === data.defs.primitive.ifnum)        ||
                  (macro === data.defs.primitive.ifhmode      || macro.isLet && macro.original === data.defs.primitive.ifhmode)      ||
                  (macro === data.defs.primitive.ifinner      || macro.isLet && macro.original === data.defs.primitive.ifinner)      ||
                  (macro === data.defs.primitive.ifmmode      || macro.isLet && macro.original === data.defs.primitive.ifmmode)      ||
                  (macro === data.defs.primitive.iftrue       || macro.isLet && macro.original === data.defs.primitive.iftrue)       ||
                  (macro === data.defs.primitive.ifvmode      || macro.isLet && macro.original === data.defs.primitive.ifvmode)      ||
                  (macro === data.defs.primitive.ifvoid       || macro.isLet && macro.original === data.defs.primitive.ifvoid)       ||
                  (macro === data.defs.primitive.ifx          || macro.isLet && macro.original === data.defs.primitive.ifx)) {
                  var expansion = e.mouth.expand(token, e.mouth);
                  if (expansion.length == 1 && expansion[0] === token && token.invalid) {
                    this.invalid = true;
                    e.mouth.loadState(defSym);
                    return [this];
                  }
                  e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
                  continue;
                } else if (macro === data.defs.primitive.noexpand || macro.proxy && macro.original === data.defs.primitive.noexpand) {
                  noexpand = true;
                  continue;
                }
                // If the macro is any other primitive, don't expand it.
                if (macro instanceof Primitive || macro.proxy && macro.original instanceof Primitive) {
                  replacement.push(token);
                  continue;
                }
  
                // Now, the macro has to be expanded.
                e.mouth.queue.unshift.apply(e.mouth.queue, e.mouth.expand(token, e.mouth));
              } else replacement.push(token);
            }
  
            replacement.shift();
            if (endInOpen) replacement.push(params[params.length - 1]);
            var macro = new Macro(replacement, params);
            if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
              if (type == 'macro') {
                data.defs.macros[name] = macro;
                delete data.registers.named[name];
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].defs.macros[name] = macro;
                  delete e.scopes[i].registers.named[name];
                }
              } else {
                data.defs.active[name] = macro;
                delete data.registers.named[name];
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].defs.ative[name] = macro;
                  delete e.scopes[i].registers.named[name];
                }
              }
            } else {
              e.scopes.last().defs[type == 'macro' ? 'macros' : 'active'][name] = macro;
              delete e.scopes.last().registers.named[name];
            }
            e.toggles.global = false;
            return [];
          }),
          else: new Primitive('else', function(e) {
            // \else is only allowed in the context of a \if. \if commands (more specifically the
            // `evalIf` function) all evaluate \else commands in their own definitions, so if this
            // function is being called, it means it's in the wrong context and should return invalid.
  
            return fail(this);
          }),
          endcsname: new Primitive("endcsname", function(e) {
            // \endcsname is used as the closer for \csname. Since \csname parses up to the first
            // \endcsname though, this primitive function isn't actually called at the end of a
            // \csname. If this function DOES get called, it means that there isn't a \csname before
            // it, and that its call is invalid. This function automatically returns invalid instead
            // of actually doing anything. It's only here to be used in \csname.
            return fail(this);
          }),
          endgroup: new Primitive('endgroup', function(e) {
            // \endgroup closes groups opened by \begingroup.
            if (!e.openGroups.length || e.scopes.last().delimited || e.scopes.last().isHalign || e.scopes.last().isHalignCell || !e.scopes.last().semisimple || e.contexts.last != 'scope') {
              this.invalid = true;
              return [this];
            }
  
            if (e.scopes.last().root) e.scopes.last().root.invalid = true;
  
            e.openGroups.pop();
            e.contexts.pop();
            var tokens = e.scopes.last().tokens;
            if (e.scopes.last().isFrac) {
              e.scopes[e.scopes.length - 2].tokens.push({
                type: 'atom',
                atomType: 0,
                nucleus: [{
                  type: 'atom',
                  atomType: 'inner',
                  nucleus: [{
                    type: 'fraction',
                    numerator: e.scopes.last().fracNumerator,
                    denominator: tokens,
                    barWidth: e.scopes.last().barWidth,
                    delims: [e.scopes.last().fracLeftDelim, e.scopes.last().fracRightDelim],
                    nullDelimiterSpace: new DimenReg(e.scopes.last().registers.named.nulldelimiterspace)
                  }],
                  superscript: null,
                  subscript: null
                }],
                superscript: null,
                subscript: null
              });
              e.scopes.pop();
            } else {
              e.scopes.pop();
              e.scopes.last().tokens.push({
                type: 'atom',
                atomType: 0,
                nucleus: tokens,
                superscript: null,
                subscript: null
              });
            }
          }),
          Error: new Primitive('Error', function(e) {
            // \Error is not a builtin TeX primitive. In TeX, there's a way to write to the
            // terminal to report errors. In this version of TeX, errors are reported by mark-
            // ing tokens as invalid and rendering them in red. That's where this primitive
            // comes in. It takes a single argument and will expand to the argument while mark-
            // ing each token inside the argument invalid. Commands inside are not expanded and
            // instead treated as literal tokens (e.g. \Error{\macro} will produce a "\macro"
            // red text instead of what \macro expands to). To get commands inside to be ex-
            // panded, use \ExpandedError.
  
            var errSym = Symbol();
            e.mouth.saveState(errSym);
  
            var token = e.mouth.eat();
            if (!token || token.type != 'character' || token.cat != catcodes.OPEN) {
              this.invalid = true;
              return [this];
            } else {
              var openGroups = 0,
                tokens = [];
              while (true) {
                var token = e.mouth.eat('pre space');
  
                if (!token) {
                  this.invalid = true;
                  e.mouth.loadState(errSym);
                  return [this];
                } else if (token.type == 'character' && token.cat == catcodes.OPEN) {
                  openGroups++;
                  tokens.push(token.char);
                } else if (token.type == 'character' && token.cat == catcodes.CLOSE) {
                  if (!openGroups) break;
                  openGroups--;
                  tokens.push(token.char);
                } else if (token.type == 'command') {
                  tokens.push(token.escapeChar);
                  tokens.push.apply(tokens, token.name.split(''));
                } else {
                  tokens.push(token.char);
                }
              }
              return tokens.map(function(a) {
                return {
                  type: 'character',
                  char: a,
                  code: a.charCodeAt(0),
                  cat: 12,
                  invalid: true,
                  recognized: true
                };
              });
            }
          }),
          expandafter: new Primitive('expandafter', function(e) {
            // \expandafter takes two arguments. The first is a token that's absorbed and left
            // alone unexpanded. The second is another token. The second token is expanded
            // first, only one layer. Then the first token along with the expanded tokens are
            // placed back in the queue to be parsed naturally. Basically, \expandafter will
            // expand the tokens AFTER a macro before expanding the macro itself. Unlike
            // \noexpand, whose only real use is inside \edef and \xdef, \noexpand can be used
            // outside of definitions and work as intended, as well as in \edef and \xdef.
  
            var expandAfterSym = Symbol();
            e.mouth.saveState(expandAfterSym);
  
            // This is the token that is skipped before expanding the second token.
            var first = e.mouth.eat();
            if (!first) {
              this.invalid = true;
              return [this];
            }
  
            // Now the second token is eaten and expanded. Even if it's not expandable, an ar-
            // ray is still returned with the same token unexpanded.
            var second = e.mouth.eat(),
              expansion = e.mouth.expand(second, e.mouth);
            if (expansion.length == 1 && expansion[0] === second && second.invalid) {
              this.invalid = true;
              e.mouth.loadState(expandAfterSym);
              return [this];
            }
  
            // Now, add the tokens back to the mouth with the second token expanded and the
            // first left alone.
            return [first].concat(expansion);
          }),
          ExpandedError: new Primitive('ExpandedError', function(e) {
            // \ExpandedError is the same as \Error except commands and active characters in-
            // side its argument are expanded (unless preceded by \noexpand). Primitive com-
            // mands though are not expanded to prevent commands like \over from ruining the
            // entire scope.
  
            var errSym = Symbol();
            e.mouth.saveState(errSym);
  
            var token = e.mouth.eat();
            if (!token || token.type != 'character' || token.cat != catcodes.OPEN) {
              this.invalid = true;
              return [this];
            } else {
              var openGroups = 0,
                tokens = [],
                noexpand = false;
              while (true) {
                var token = e.mouth.eat('pre space');
  
                if (!token) {
                  this.invalid = true;
                  e.mouth.loadState(errSym);
                  return [this];
                } else if (token.type == 'character' && token.cat == catcodes.OPEN) {
                  openGroups++;
                  tokens.push(token.char);
                  noexpand = false;
                } else if (token.type == 'character' && token.cat == catcodes.CLOSE) {
                  if (!openGroups) break;
                  openGroups--;
                  tokens.push(token.char);
                  noexpand = false;
                } else if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
                  var macro = token.type == 'command' ? e.scopes.last().defs.primitive[token.name] || e.scopes.last().defs.macros[token.name] : e.scopes.last().defs.active[token.char];
                  if (!macro) {
                    this.invalid = true;
                    e.mouth.loadState(errSym);
                    return [this];
                  }
                  if (macro.proxy) macro = macro.original;
  
                  if (macro === data.defs.primitive.noexpand) {
                    noexpand = true;
                    continue;
                  } else if (!noexpand && (
                    macro === data.defs.primitive.the          ||
                    macro === data.defs.primitive.expandafter  ||
                    macro === data.defs.primitive.number       ||
                    macro === data.defs.primitive.romannumeral ||
                    macro === data.defs.primitive.csname       ||
                    macro === data.defs.primitive.string       ||
                    macro === data.defs.primitive.if           ||
                    macro === data.defs.primitive.ifcase       ||
                    macro === data.defs.primitive.ifcat        ||
                    macro === data.defs.primitive.ifdim        ||
                    macro === data.defs.primitive.ifeof        ||
                    macro === data.defs.primitive.iffalse      ||
                    macro === data.defs.primitive.ifodd        ||
                    macro === data.defs.primitive.ifnum        ||
                    macro === data.defs.primitive.ifhmode      ||
                    macro === data.defs.primitive.ifinner      ||
                    macro === data.defs.primitive.ifmmode      ||
                    macro === data.defs.primitive.iftrue       ||
                    macro === data.defs.primitive.ifvmode      ||
                    macro === data.defs.primitive.ifvoid       ||
                    macro === data.defs.primitive.ifx)) {
                    var expansion = e.mouth.expand(token, e.mouth);
                    if (expansion.length == 1 && expansion[0] === token && expansion[0].invalid) {
                      this.invalid = true;
                      e.mouth.loadState(errSym);
                      return [this];
                    }
                    e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
                    noexpand = false;
                    continue;
                  } else if (macro instanceof Primitive) {
                    tokens.push(String.fromCharCode(e.scopes.last().registers.named.escapechar.value));
                    tokens.push.apply(tokens, macro.name.split(''));
                    noexpand = false;
                    continue;
                  }
                  if (noexpand) {
                    tokens.push(String.fromCharCode(e.scopes.last().registers.named.escapechar.value));
                    tokens.push.apply(tokens, token.name.split(''));
                  } else {
                    var expansion = e.mouth.expand(token, e.mouth);
                    if (expansion.length == 1 && expansion[0] === token && expansion[0].invalid) {
                      this.invalid = true;
                      e.mouth.loadState(errSym);
                      return [this];
                    }
                    e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
                  }
                  noexpand = false;
                } else {
                  tokens.push(token.char);
                  noexpand = false;
                }
              }
              return tokens.map(function(a) {
                return {
                  type: 'character',
                  char: a,
                  code: a.charCodeAt(0),
                  cat: 12,
                  invalid: true,
                  recognized: true
                };
              });
            }
          }),
          fi: new Primitive("fi", function(e) {
            // \fi works the same as \else in that it's handled in the definitions of \if commands. It
            // should always return invalid. \fi is used to close \if blocks.
  
            return fail(this);
          }),
          futurelet: new Primitive('futurelet', function(e) {
            // \futurelet is used to look at the next upcoming token and do something with it,
            // before it is absorbed. \futurelet[command name][token 1][token 2] is basically
            // the same as \let[command name][token 2][token 1][token 2]. First, the \let is
            // executed and [command name] == [token 2]. Then, [token 1] has access to [token
            // 2] via [command name]. It's able to expand into a macro that uses (and expects)
            // [token 2] as a parameter.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var letSym = Symbol();
            e.mouth.saveState(letSym);
  
            var name = e.mouth.eat();
            if (!name) {
              this.invalid = true;
              return [this];
            }
            var type;
            if (name.type == 'character') {
              if (e.catOf(name.char) == catcodes.ACTIVE) {
                type = 'active';
                name = name.char;
              } else {
                this.invalid = true;
                e.mouth.loadState(letSym);
                return [this];
              }
            } else if (name.type == 'command') {
              type = 'macro';
              name = name.name;
              if (name in e.scopes.last().defs.primitive || name in data.parameters) {
                this.invalid = true;
                e.mouth.loadState(letSym);
                return [this];
              }
            }
  
            var optEquals = e.mouth.eat();
            if (!optEquals || optEquals.type != 'character' || optEquals.char != '=' || optEquals.cat != catcodes.OTHER) optEquals && e.mouth.revert();
  
            // `token1' is the token that is skipped. Once that's been absorbed, the next token
            // is what's used for the \let operation.
            var token1 = e.mouth.eat();
  
            if (!token1) {
              this.invalid = true;
              e.mouth.loadState(letSym);
              return [this];
            }
  
            var token2 = e.mouth.eat();
  
            if (!token2) {
              this.invalid = true;
              e.mouth.loadState(letSym);
              return [this];
            } else if (token2.type == 'command' || token2.type == 'character' && token2.cat == catcodes.ACTIVE) {
              var macro = token2.type == 'command' ? e.scopes.last().defs.primitive[token2.name] || e.scopes.last().defs.macros[token2.name] : e.scopes.last().defs.active[token2.name];
              if (macro) macro = new Macro(macro, macro.type == 'primitive' || macro.isLet);
              else if (token2.type == 'command' && type == 'macro') {
                // Check if the command refers to a register.
                var reg = e.scopes.last().registers.named[token2.name];
                if (reg) {
                  // If it does, make a new entry in the named registers.
                  if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
                    data.registers.named[name] = reg;
                    delete data.defs.macros[name];
                    for (var i = 0, l = e.scopes.length; i < l; i++) {
                      e.scopes[i].registers.named[name] = reg;
                      delete e.scopes[i].defs.macros[name];
                    }
                  } else {
                    e.scopes.last().registers.named[name] = reg;
                    delete e.scopes.last().defs.macros[name];
                  }
                  e.toggles.global = false;
                  return [];
                }
              }
            } else {
              // There are two calls to new Macro so that the macro is recognized as a proxy.
              var macro = new Macro(new Macro([token2]), true);
            }
  
            if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
              if (type == 'macro') {
                if (macro) data.defs.macros[name] = macro;
                else delete data.defs.macros[name];
                delete data.registers.named[name];
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  if (macro) e.scopes[i].defs.macros[name] = macro;
                  else delete e.scopes[i].defs.macros[name];
                  delete e.scopes[i].registers.named[name];
                }
              } else {
                if (macro) data.defs.active[name] = macro;
                else delete e.scopes[i].defs.macros[name];
                delete data.registers.named[name];
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  if (macro) e.scopes[i].defs.ative[name] = macro;
                  else delete e.scopes[i].defs.macros[name];
                  delete e.scopes[i].registers.named[name];
                }
              }
            } else {
              if (macro) e.scopes.last().defs[type == 'macro' ? 'macros' : 'active'][name] = macro;
              else delete e.scopes.last().defs[type == 'macro' ? 'macros' : 'active'][name];
              delete e.scopes.last().registers.named[name];
            }
  
            e.toggles.global = false;
  
            return [token1, token2];
          }),
          gdef: new Primitive('gdef', function(e) {
            // \gdef is exactly the same as \global\def. It doesn't matter if there is a
            // \global before the command as \global\global\def is the same as \global\def
            // (i.e. it doesn't matter how many \global commands there are). If \globaldefs is
            // negative though, it is still able to negate the \global in \gdef. Most of the
            // code is exactly the same as \def, so comments aren't repeated.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var defSym = Symbol();
            e.mouth.saveState(defSym);
            var name = e.mouth.eat();
            if (!name) {
              this.invalid = true;
              return [this];
            }
            var type;
            if (name.type == 'character') {
              if (e.catOf(name.char) == catcodes.ACTIVE) {
                type = 'active';
                name = name.char;
              } else {
                this.invalid = true;
                e.mouth.loadState(defSym);
                return [this];
              }
            } else if (name.type == 'command') {
              type = 'macro';
              name = name.name;
              if (name in e.scopes.last().defs.primitive || name in data.parameters) {
                this.invalid = true;
                e.mouth.loadState(defSym);
                return [this];
              }
            }
            var params = [],
              used = 0,
              endInOpen = false;
            while (true) {
              var token = e.mouth.eat();
              if (!token) {
                this.invalid = true;
                e.mouth.loadState(defSym);
                return [this];
              } else if (token.cat == catcodes.OPEN) {
                e.mouth.revert();
                break;
              } else if (token.cat == catcodes.PARAMETER) {
                var paramTok = e.mouth.eat('pre space');
                if (!paramTok) {
                  this.invalid = true;
                  e.mouth.loadState(defSym);
                  return [this];
                } else if (paramTok.cat == catcodes.OPEN) {
                  endInOpen = true;
                  e.mouth.revert();
                  params.push({
                    type: 'character',
                    cat: catcodes.OPEN,
                    char: paramTok.char,
                    code: paramTok.code
                  });
                } else if (48 < paramTok.code && paramTok.code < 58 && paramTok.cat == catcodes.OTHER && +paramTok.char == used + 1) {
                  params.push(token);
                  used++;
                } else {
                  this.invalid = true;
                  e.mouth.loadState(defSym);
                  return [this];
                }
              } else {
                params.push(token);
              }
            }
            var openGroups = 0,
              replacement = [],
              skip = false;
            while (true) {
              var token = e.mouth.eat();
              if (!token) {
                this.invalid = true;
                e.mouth.loadState(defSym);
                return [this];
              } else if (token.type == 'character' && token.cat == catcodes.PARAMETER && !skip) {
                var index = e.mouth.eat('pre space');
                if (index && (index.cat == catcodes.PARAMETER || (index.cat == catcodes.OTHER && index.char <= params.length && index.char >= 1))) {
                  e.mouth.revert();
                  if (index.cat == catcodes.PARAMETER) skip = true;
                } else {
                  this.invalid = true;
                  e.mouth.loadState(defSym);
                  return [this];
                }
              } else if (token.type == 'character' && token.cat == catcodes.OPEN) openGroups++;
              else if (token.type == 'character' && token.cat == catcodes.CLOSE) {
                openGroups--;
                if (openGroups == 0) break;
              }
              replacement.push(token);
            }
            replacement.shift();
            if (endInOpen) replacement.push(params[params.length - 1]);
            var macro = new Macro(replacement, params);
            if (e.scopes.last().registers.named.globaldefs.value < 0) {
              e.scopes.last().defs[type == 'macro' ? 'macros' : 'active'][name] = macro;
              delete e.scopes.last().registers.named[name];
            } else {
              if (type == 'macro') {
                data.defs.macros[name] = macro;
                delete data.registers.named[name];
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].defs.macros[name] = macro;
                  delete e.scopes[i].registers.named[name];
                }
              } else {
                data.defs.active[name] = macro;
                delete data.registers.named[name];
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].defs.ative[name] = macro;
                  delete e.scopes[i].registers.named[name];
                }
              }
            }
            e.toggles.global = false;
            return [];
          }),
          global: new Primitive("global", function(e) {
            // \global makes the next definition affect all scopes, including any future scopes that
            // haven't been created yet. If the next token isn't a definition, then it is marked as 
            // invalid (that doesn't happen here though since the parser doesn't know what the next
            // token is yet).
  
            if (e.lastContext.type == "superscript" || e.lastContext.type == "subscript") {
              return fail(this);
            }
  
            e.toggles.global = this;
            this.ignore = true;
            return [this];
          }),
          halign: new Primitive("halign", function(e) {
            // \halign is used to create tables. It's used in the creation of matrices, but can be
            // used directly by the user to create custom tables formatted according to a template
            // preamble. The argument must be enclosed in opening and closing tokens. Each line of the
            // table is delimited by a \cr ending. Each line is split into columns, which are delim-
            // ited by an alignment token (usually &). A 2x2 table for example would be formatted as
            // (0, 0) & (0, 1) \cr (1, 0) & (1, 1). \halign uses the first row provided in its argu-
            // ment as a template preamble for the rest of the rows. The template is used to define
            // what will go around each cell in the table. If one of the columns in the preamble is
            // \sl#, then each cell in that column will be preceded by \sl, which will make each cell
            // render in an oblique (slanted) font. If another was \hfil\hfil#\hfil, then the content
            // of the cell would be positioned such that there would be 2x amount of space on the left
            // and 1x amount of space on the right. A table cell can also use the \omit primitive to
            // omit the template altogether. That'll cause only the table cell's content to be dis-
            // played without whatever was defined in the template. After each \cr, a \noalign command
            // is allowed, which will add a "nonaligned" row to the table (which is just a row with a
            // single long cell). The text inside the \noalign command's argument will be added to the
            // row. This lets you add vertical spacing between rows in case you want them to be fur-
            // ther apart. In TeX, you can also add negative space to make rows overlap each other,
            // but that's not allowed with HTML <table>s, so that's not implemented in this version.
            // Also, each table cell is treated as its own group. Saying \sl in one cell won't cause
            // all the cells following it to also be slanted since \sl is contained to its own group.
            // Also also, in TeX, you can't really use this command in math mode, but that's not real-
            // ly an option here since this is always in math mode. As a way to fix that, each table
            // is rendered inside an Ord atom's nucleus (unless that's changed with commands like
            // \mathbin). The TeXbook includes an entire chapter pretty much dedicated to this command
            // (pg. 231) and how it parses its argument and whatnot, so look there for more info.
  
            let halignSym = Symbol();
            e.mouth.saveState(halignSym);
  
            // First, make sure the argument starts with an opening brace.
            let token = e.mouth.eat();
            if (!token || token.cat != catcodes.OPEN) {
              e.mouth.loadState(halignSym);
              return fail(this);
            }
  
            let preamble = [[[]]];
            let repeatAt = -1;
            let tabSkips = [new GlueReg(e.lastScope.registers.named.tabskip)];
            let globalTabSkip = false;
            // The preamble has to be parsed now. Only five tokens are actually looked at, the
            // rest stay in the preamble unexpanded and are added to each cell directly.
            while (true) {
              let token = e.mouth.eat("pre space");
  
              if (!token) {
                e.mouth.loadState(halignSym);
                return fail(this);
              } else if (expandable(token)) {
                let macro = token.type == "command" ?
                    e.lastScope.defs.primitive[token.name] ||
                    e.lastScope.defs.macros[token.name] ||
                    e.lastScope.registers.named[token.name] :
                    e.lastScope.defs.active[token.char];
  
                if (macro && macro.proxy) {
                  macro = macro.original;
                }
  
                if (!macro) {
                  // If the macro doesn't exist, just add it to preamble list since it might be de-
                  // fined by the time the preamble is evaluated.
                  (preamble[preamble.length - 1][1] || preamble[preamble.length - 1][0]).push(token);
                  continue;
                } else if (macro === data.defs.primitive.cr) {
                  // If \cr is found, the end of the row was found and the preamble is done. Make sure
                  // the preamble has at least one complete column.
                  if (preamble[preamble.length - 1][1]) {
                    // Add one more tabskip entry for the end of the table.
                    tabSkips.push(new GlueReg(e.lastScope.registers.named.tabskip));
                    // Also change \tabskip back to the value it was at before the \halign. But also
                    // take into consideration if a \global definition was made. If there was one,
                    // change it to the latest \global definition.
                    let glue = globalTabSkip || tabSkips[0];
                    let tabskip = e.lastScope.registers.named.tabskip;
  
                    tabskip.start.sp.value = glue.start.sp.value;
                    tabskip.start.em.value = glue.start.em.value;
  
                    if (glue.stretch.type == "infinite dimension") {
                      tabskip.stretch =
                          new InfDimen(glue.stretch.number.value, glue.stretch.magnitude.value);
                    } else {
                      tabskip.stretch = new DimenReg(glue.stretch.sp.value, glue.stretch.em.value);
                    }
  
                    if (glue.shrink.type == "infinite dimension") {
                      tabskip.shrink =
                          new InfDimen(glue.shrink.number.value, glue.shrink.magnitude.value);
                    } else {
                      tabskip.shrink = new DimenReg(glue.shrink.sp.value, glue.shrink.em.value);
                    }
  
                    break;
                  } else {
                    e.mouth.loadState(halignSym);
                    return fail(this);
                  }
                } else if (macro === e.lastScope.registers.named.tabskip) {
                  // If \tabskip is found, it should automatically be treated like a definition since
                  // it controls the spacing between rows. An optional space and some glue are looked
                  // for to set it. The definition is only local to the \halign; after the \halign,
                  // \tabskip is reset to its previous value.
  
                  let tabSkipDef = Symbol();
                  e.mouth.saveState(tabSkipDef);
  
                  doOptEqual();
  
                  let glue = e.mouth.eat("glue");
                  if (!glue) {
                    // If no glue was found to set \tabskip to, the \tabskip is left in the preamble
                    // so that it'll be parsed later when the preamble gets actually evaluated. In
                    // normal TeX, an error would be thrown if there's a random register without a
                    // definition. In this version though, since it reports errors as invalid tokens
                    // instead of aborting the whole thing, that's a lot harder to keep track of. The
                    // \tabskip is just left alone without aborting the whole \halign.
                    e.mouth.loadState(tabSkipDef);
                    (preamble[preamble.length - 1][1] || preamble[preamble.length - 1][0]).push(token);
                    continue;
                  }
  
                  // If a glue was found, \tabskip is set to its value temporarily. After the preamble
                  // is done parsing, \tabskip is returned to the value it had before the \halign. The
                  // definition might also be \global though if \globaldefs is positive.
                  let tabskip = e.lastScope.registers.named.tabskip;
  
                  tabskip.start.sp.value = glue.start.sp.value;
                  tabskip.start.em.value = glue.start.em.value;
  
                  if (glue.stretch.type == "infinite dimension") {
                    tabskip.stretch =
                        new InfDimen(glue.stretch.number.value, glue.stretch.magnitude.value);
                  } else {
                    tabskip.stretch = new DimenReg(glue.stretch.sp.value, glue.stretch.em.value);
                  }
  
                  if (glue.shrink.type == "infinite dimension") {
                    tabskip.shrink =
                        new InfDimen(glue.shrink.number.value, glue.shrink.magnitude.value);
                  } else {
                    tabskip.shrink = new DimenReg(glue.shrink.sp.value, glue.shrink.em.value);
                  }
  
                  if (e.lastScope.registers.named.globaldefs.value > 0) {
                    globalTabSkip = new GlueReg(tabskip);
  
                    while (tabskip.parent) {
                      tabskip = tabskip.parent;
  
                      tabskip.start.sp.value = glue.start.sp.value;
                      tabskip.start.em.value = glue.start.em.value;
  
                      if (glue.stretch.type == "infinite dimension") {
                        tabskip.stretch =
                            new InfDimen(glue.stretch.number.value, glue.stretch.magnitude.value);
                      } else {
                        tabskip.stretch = new DimenReg(glue.stretch.sp.value, glue.stretch.em.value);
                      }
  
                      if (glue.shrink.type == "infinite dimension") {
                        tabSkips.shrink =
                            new InfDimen(glue.shrink.number.value, glue.shrink.magnitude.value);
                      } else {
                        tabskip.shrink = new DimenReg(glue.shrink.sp.value, glue.shrink.em.value);
                      }
                    }
                  }
                  continue;
                } else if (macro === data.defs.primitive.span) {
                  // \span is like the opposite of \noexpand. Here, all the tokens are being skipped
                  // over except a select few. \span will expand the next token using `Mouth.expand`.
                  let next = e.mouth.eat();
  
                  if (!next) {
                    e.mouth.loadState(halignSym);
                    return fail(this);
                  }
  
                  let expansion = e.mouth.expand(next, e.mouth);
                  if (expansion.length == 1 && expansion[0] === next && next.invalid) {
                    e.mouth.loadState(halignSym);
                    return fail(this);
                  }
                  e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
                  continue;
                } else if (macro.replacement && macro.replacement[0] &&
                    macro.replacement[0].cat == catcodes.PARAMETER) {
                  // A parameter token was found. It indicates where the text of each column should
                  // go.
                  if (preamble[preamble.length - 1][1]) {
                    // A parameter token was already found for the current column, which makes this
                    // preamble cell invalid.
                    e.mouth.loadState(halignSym);
                    return fail(this);
                  }
                  preamble[preamble.length - 1][1] = [];
                  continue;
                } else if (macro.replacement && macro.replacement[0] &&
                    macro.replacement[0].cat == catcodes.ALIGN) {
                  // A tab alignment token was found. It indicates the end of the cell. If the previ-
                  // ous cell is empty, it indicates that all the cells from here on out will be re-
                  // peated indefinitely, as much as the columns in the table need them.
                  if (!~repeatAt && !preamble[preamble.length - 1][0].length &&
                      !preamble[preamble.length - 1][1]) {
                    // The previous cell was empty. Set the `repeatAt` variable to the current length
                    // of `preamble' to indicate that all the cells after `repeatAt` are repeatable.
                    repeatAt = preamble.length - 1;
                    // Instead of creating a new cell for the preamble, the current one is used since
                    // it's still empty.
                  } else if (preamble[preamble.length - 1][1]) {
                    // The previous cell was complete. Make a new one.
                    preamble.push([[]]);
                    // This adds another entry to the `tabSkips' array. It'll control the spacing be-
                    // tween the current row and the next. It's added using a blank column with nothing
                    // but the space specified by \tabskip.
                    tabSkips.push(new GlueReg(e.lastScope.registers.named.tabskip));
                  } else {
                    // The last cell doesn't include a parameter token, which makes the cell an invalid
                    // preamble.
                    e.mouth.loadState(halignSym);
                    return fail(this);
                  }
                  continue;
                }
              } else {
                if (token.cat == catcodes.PARAMETER) {
                  // This is copied from above.
                  if (preamble[preamble.length - 1][1]) {
                    e.mouth.loadState(halignSym);
                    return fail(this);
                  }
                  preamble[preamble.length - 1][1] = [];
                  continue;
                } else if (token.cat == catcodes.ALIGN) {
                  // This too.
                  if (!~repeatAt && !preamble[preamble.length - 1][0].length &&
                      !preamble[preamble.length - 1][1]) {
                    repeatAt = preamble.length - 1;
                  } else if (preamble[preamble.length - 1][1]) {
                    preamble.push([[]]);
                    tabSkips.push(new GlueReg(e.lastScope.registers.named.tabskip));
                  } else {
                    e.mouth.loadState(halignSym);
                    return fail(this);
                  }
                  continue;
                } else if (token.cat == catcodes.WHITESPACE &&
                    !preamble[preamble.length - 1][0].length && !preamble[preamble.length - 1][1]) {
                  // If a whitespace token is found immediately after an alignment character, it is
                  // ignored to allow for line breaks right after them.
                  continue;
                }
              }
              (preamble[preamble.length - 1][1] || preamble[preamble.length - 1][0]).push(token);
            }
  
            // Now that the preamble has finished parsing, now comes the actual body of the table. But
            // instead of parsing the body here, it's parsed at the top level parser since that's the
            // only place where tokens like ^, _, #, etc. can be dealt with correctly. A special scope
            // is created to house all the tokens inside the table's body. When the scope is closed,
            // instead of being added as a regular Ord atom, the table is compiled into an array and
            // stored as a special object in an Inner atom's nucleus.
  
            // This ignored atom is used in case the \halign scope is never closed, similar to
            // how a regular group is made. If the scope is never closed, the token is marked
            // as invalid. Otherwise, it's taken out of the final token list.
            let atom = {
              type: "atom",
              atomType: atomTypes.ORD,
              nucleus: (this.type == "command" ? this.escapeChar + this.name : this.char)
                  .split("")
                  .map(char => ({
                    type: "atom",
                    atomType: atomTypes.ORD,
                    nucleus: {
                      type: "symbol",
                      char: char,
                      code: char.codePointAt(0)
                    },
                    superscript: null,
                    subscript: null
                  })),
              superscript: null,
              subscript: null,
              ignore: true
            };
  
            e.openGroups.push(atom);
            e.contexts.push({
              toString: () => "scope",
              type: "scope"
            });
            new e.Scope();
            let lastScope = e.scopes[e.scopes.length - 1];
            lastScope.tokens.push(atom);
            // `isHalign` marks the scope so that the outside parser will know to expect tokens like &
            // and what to do when the scope is closed.
            lastScope.isHalign = true;
            // This is where the table cells will be stored while they are being parsed. Each item in
            // the array will be a row. Each row will be an array, with each item in there being an
            // object representing the data for that cell.
            lastScope.cellData = [];
            // Now store the info that was gotten here on the scope as well (the preamble and tabskips
            // and stuff).
            lastScope.preamble = preamble;
            lastScope.repeatPreambleAt = repeatAt;
            lastScope.tabSkips = tabSkips;
            // This will keep track of any \noalign space between rows.
            lastScope.noAligns = [];
            // Now that the scope has been set up, the mouth spits the last eaten \cr back out. That's
            // because each table cell needs to have its own scope. The only way that happens is in-
            // side the \cr function definition, and after each alignment token. Spitting the \cr back
            // out lets the parser find it naturally and expand it, which sets up the scope for the
            // first table cell.
            e.mouth.revert();
            // The table data is still stored in the mouth, so this primitive doesn't actually
            // expand to anything.
            return [];
          }),
          hbox: new Primitive('hbox', function(e) {
            // So even though boxes don't really exist in this version of TeX, \hbox is in-
            // cluded so that fixed-size blocks of text can still be rendered. Normally, \hbox
            // would create a new horizontal box, usually with characters in it. After the
            // "\hbox", you would be able to add "to" or "spread". The "to" would set the width
            // of the box, disregarding whether the characters inside it would overflow or not.
            // The "spread" would first render the box like normal, and then add on a set width
            // so that the width can still be altered by its contents. This version of TeX uses
            // HTML, so boxes aren't really a thing here. \hbox here acts like a single-celled
            // \halign when it's created (so \hfil will still work inside it), but it's width
            // may be changed. If a \hbox here doesn't have a "to" or "spread" associated with
            // it, it's parsed as a regular group of tokens since it would have the same width.
            // A custom "hbox" token is created that'll be parsed later in the HTML generator
            // so it will have the correct width.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var hboxSym = Symbol();
            e.mouth.saveState(hboxSym);
  
            var spread, to;
  
            // First, a "t" (for "to") or "s" (for "spread") is looked for. If it doesn't find
            // one, the token should be an opening character. If it is, token is spit back out
            // and the function returns. The opening token and its closing token will all be
            // parsed as a regular group of tokens. If the token wasn't an opening token, the
            // \hbox is returned invalid.
            while (true) {
              var token = e.mouth.eat();
  
              if (!token) {
                this.invalid = true;
                return [this];
              }
  
              if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
                var macro = token.type == 'command' ? e.scopes.last().defs.primitive[token.name] || e.scopes.last().defs.macros[token.name] : e.scopes.last().defs.active[token.char];
                if (macro && (macro === data.defs.primitive.relax || macro.proxy && macro.original === data.defs.primitive.relax)) {
                  break;
                }
                var expansion = e.mouth.expand(token, e.mouth);
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
                continue;
              } else if (token.type == 'character' && (token.char == 't' || token.char == 'T')) {
                // A "t" was found. Make sure the next token is an "o" and then a dimension.
                var o = e.mouth.eat('pre space');
                if (o && o.type == 'character' && (o.char == 'o' || token.char == 'O') && token.cat != catcodes.ACTIVE) {
                  var dimen = e.mouth.eat('dimension');
                  if (dimen) {
                    to = dimen;
                    break;
                  } else {
                    this.invalid = true;
                    e.mouth.loadState(hboxSym);
                    return [this];
                  }
                } else {
                  this.invalid = true;
                  e.mouth.loadState(hboxSym);
                  return [this];
                }
              } else if (token.type == 'character' && (token.char == 's' || token.char == 'S')) {
                // An "s" was found. Make sure the next five tokens are "pread" and then a dimen-
                // sion.
                var p = e.mouth.eat(),
                  r = e.mouth.eat(),
                  E = e.mouth.eat(),
                  a = e.mouth.eat(),
                  d = e.mouth.eat();
                if (!p || p.type != 'character' || p.char != 'p' && p.char != 'P' || p.cat == catcodes.ACTIVE ||
                  !r || r.type != 'character' || r.char != 'r' && r.char != 'R' || r.cat == catcodes.ACTIVE ||
                  !E || E.type != 'character' || E.char != 'e' && E.char != 'E' || E.cat == catcodes.ACTIVE ||
                  !a || a.type != 'character' || a.char != 'a' && a.char != 'A' || a.cat == catcodes.ACTIVE ||
                  !d || d.type != 'character' || d.char != 'd' && d.char != 'D' || d.cat == catcodes.ACTIVE) {
                  this.invalid = true;
                  e.mouth.loadState(hboxSym);
                  return [this];
                }
                var dimen = e.mouth.eat('dimension');
                if (dimen) {
                  spread = dimen;
                  break;
                } else {
                  this.invalid = true;
                  e.mouth.loadState(hboxSym);
                  return [this];
                }
              } else if (token.type == 'character' && token.cat == catcodes.OPEN) {
                // Spit the token back out and let the parser make a group from the rest of the
                // argument.
                e.mouth.revert();
                break;
              } else {
                // Some invalid token was found. The argument to \hbox wasn't correct and it should
                // return invalid.
                this.invalid = true;
                e.mouth.loadState(hboxSym);
                return [this];
              }
            }
            // Make sure the next token is an opening group token to validate that \hbox got
            // its proper argument.
            var open = e.mouth.preview();
            if (!open || open.type != 'character' || open.cat != catcodes.OPEN) {
              this.invalid = true;
              e.mouth.loadState(hboxSym);
              return [this];
            }
  
            // If the "spread" value is 0, then it's the same thing as if it had just been
            // passed as \hbox{}, which means the tokens can be parsed as a regular group.
            // "to" isn't checked for 0 because have \hbox to 0pt{} will make the box not
            // have any width as opposed to its natural width.
            if (!to && !spread) {
              spread = new DimenReg(0, 0);
            }
            // The next group of tokens will be parsed like normal and be placed in their own
            // atom. A temporary token is created so that the next group atom after it (i.e.
            // the argument to \hbox) will be placed inside an \hbox token. It's like the same
            // as how \accent behaves.
            e.tokens.push({
              type: 'box wrapper',
              value: 'horizontal',
              to: to,
              spread: spread,
              token: this
            });
            return [];
          }),
          hfil: new Primitive('hfil', function(e) {
            // \hfil is exactly the same as "\hskip0pt plus 1fil\relax". TeX sets it up to be a
            // primitive for efficiency reason, even though it could be implemented like a mac-
            // ro. Since it doesn't have a starting value, it'll be completely ignored outside
            // of a table or fraction or \hbox since only in those cases are flexboxes used.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'glue',
              glue: new GlueReg(new DimenReg(0), new InfDimen(1 * 65536, 1), new DimenReg(0))
            });
            return [];
          }),
          hfill: new Primitive('hfill', function(e) {
            // This is exactly the same as \hfil but with 1fill of stretchability instead of
            // 1fil.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'glue',
              glue: new GlueReg(new DimenReg(0), new InfDimen(1 * 65536, 2), new DimenReg(0))
            });
            return [];
          }),
          hrule: new Primitive('hrule', function(e) {
            // \hrule let's users make boxes of an exact height, depth, and width. The user
            // specifies dimensions using the "height", "depth", and "width" keywords, followed
            // by a dimension. If a dimension is missing, the following default dimensions are
            // used instead: height: 1/30em (scalable version of 0.4pt), depth: 0em, width:
            // 100% of the parent container.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var hruleSym = Symbol();
            e.mouth.saveState(hruleSym);
  
            var height = false,
              depth = false,
              width = false;
  
            while (true) {
              var token = e.mouth.eat();
  
              if (!token) {
                break;
              }
  
              if ((token.char == 'h' || token.char == 'H') && token.cat != catcodes.ACTIVE) {
                // If there is an "h", "eight" plus a dimension should follow. If that isn't what
                // follows, everything after the "h" is ignored.
                token = e.mouth.eat('pre space');
                if (token && (token.char == 'e' || token.char == 'E') && token.cat != catcodes.ACTIVE) {
                  token = e.mouth.eat('pre space');
                  if (token && (token.char == 'i' || token.char == 'I') && token.cat != catcodes.ACTIVE) {
                    token = e.mouth.eat('pre space');
                    if (token && (token.char == 'g' || token.char == 'G') && token.cat != catcodes.ACTIVE) {
                      token = e.mouth.eat('pre space');
                      if (token && (token.char == 'h' || token.char == 'H') && token.cat != catcodes.ACTIVE) {
                        token = e.mouth.eat('pre space');
                        if (token && (token.char == 't' || token.char == 'T') && token.cat != catcodes.ACTIVE) {
                          token = e.mouth.eat('dimension');
                          if (token) {
                            height = token;
                            continue;
                          } else e.mouth.revert(6);
                        } else e.mouth.revert(token ? 6 : 5);
                      } else e.mouth.revert(token ? 5 : 4);
                    } else e.mouth.revert(token ? 4 : 3);
                  } else e.mouth.revert(token ? 3 : 2);
                } else e.mouth.revert(token ? 2 : 1);
                break;
              } else if ((token.char == 'd' || token.char == 'D') && token.cat != catcodes.ACTIVE) {
                // This does the same thing as above for "depth".
                token = e.mouth.eat('pre space');
                if (token && (token.char == 'e' || token.char == 'E') && token.cat != catcodes.ACTIVE) {
                  token = e.mouth.eat('pre space');
                  if (token && (token.char == 'p' || token.char == 'P') && token.cat != catcodes.ACTIVE) {
                    token = e.mouth.eat('pre space');
                    if (token && (token.char == 't' || token.char == 'T') && token.cat != catcodes.ACTIVE) {
                      token = e.mouth.eat('pre space');
                      if (token && (token.char == 'h' || token.char == 'H') && token.cat != catcodes.ACTIVE) {
                        token = e.mouth.eat('dimension');
                        if (token) {
                          depth = token;
                          continue;
                        } else e.mouth.revert(5);
                      } else e.mouth.revert(token ? 5 : 4);
                    } else e.mouth.revert(token ? 4 : 3);
                  } else e.mouth.revert(token ? 3 : 2);
                } else e.mouth.revert(token ? 2 : 1);
                break;
              } else if ((token.char == 'w' || token.char == 'W') && token.cat != catcodes.ACTIVE) {
                // This does the same thing as above for "width".
                token = e.mouth.eat('pre space');
                if (token && (token.char == 'i' || token.char == 'I') && token.cat != catcodes.ACTIVE) {
                  token = e.mouth.eat('pre space');
                  if (token && (token.char == 'd' || token.char == 'D') && token.cat != catcodes.ACTIVE) {
                    token = e.mouth.eat('pre space');
                    if (token && (token.char == 't' || token.char == 'T') && token.cat != catcodes.ACTIVE) {
                      token = e.mouth.eat('pre space');
                      if (token && (token.char == 'h' || token.char == 'H') && token.cat != catcodes.ACTIVE) {
                        token = e.mouth.eat('dimension');
                        if (token) {
                          width = token;
                          continue;
                        } else e.mouth.revert(5);
                      } else e.mouth.revert(token ? 5 : 4);
                    } else e.mouth.revert(token ? 4 : 3);
                  } else e.mouth.revert(token ? 3 : 2);
                } else e.mouth.revert(token ? 2 : 1);
                break;
              } else {
                e.mouth.revert();
                break;
              }
            }
  
            height = height || new DimenReg(0, 65536 / 30);
            depth = depth || new DimenReg(0, 0);
  
            e.tokens.push({
              type: 'rule',
              ruleType: 'h',
              height: height,
              depth: depth,
              width: width
            });
            return [];
          }),
          hskip: new Primitive('hskip', function(e) {
            // This is basically a glue version of \kern. When the HTML is rendered glues are
            // essentially treated like regular dimensions anyway, so \hskip and \kern pretty
            // much are the exact same thing except their argument types.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var glue = e.mouth.eat('glue');
            if (!glue) {
              this.invalid = true;
              return [this];
            }
            e.tokens.push({
              type: 'glue',
              glue: glue
            });
            return [];
          }),
          if: new Primitive('if', function(e) {
            // \if is mostly used for macros. It allows for some form of logic that affects how
            // a macro will behave in certain situations. \if is only one of 15 possible `if'
            // block starters. This \if will compare characters. Any macros after a \if will be
            // expanded until the first two unexpandable tokens are found. If the unexpandable
            // token is a command (a primitive that can't be expanded), then it will match with
            // any other unexpandable command and will return true. If one of the tokens is a
            // character, only the actual character is compared, independent of the catcodes.
            // If \def\star{*}, \let\asterisk=*, and \def\amp{&}, then the following are true:
            // \if**, \if*\star, \if\star\asterisk, \if\def\let
            // The following though are all false:
            // \if*\let, \if\star\amp, \if\amp\def, \if\asterisk&
            // After an \if command is determined to be either true or false, the text after
            // determines what happens as a result. If true, the text immediately following the
            // two compared tokens are used, all the way until a \fi or \else is encountered.
            // If false, the text after a \else is executed until the first \fi. If there is
            // no \else (\if ... \fi), then nothing is executed. While skipping over tokens
            // to find a \else or \fi, \if commands and \fi are nested to prevent breaking if
            // blocks. For example, \if01 \if ... \fi ... \else ... \fi will first evaluate to
            // false. The text following the "01" will be skipped. Since there is a \if inside,
            // the next \fi is also skipped over until the \else is found, and execution re-
            // sumes from there. If the first \if had not been found, the first \fi would not
            // have been skipped and it would have appeared like a regular if block. The \else
            // wouldn't have been found until later, and would throw an error for being in the
            // wrong context. Also note that when skipping over text, ONLY the \if groups are
            // considered. That means you are allowed to have unbalanced nesting with { and }
            // and still have it work correctly (as long as those are balanced out somewhere
            // outside the \if). All the other version of \if that test for different things
            // are found below, after this function definition.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var ifSym = Symbol();
            e.mouth.saveState(ifSym);
  
            // First, the tokens after the \if have to be expanded, similar to how \edef re-
            // cursively expands tokens.
            var tokens = [],
              noexpand = false;
            while (tokens.length < 2) {
              // Tokens are eaten and expanded recursively until the first two unexpandable to-
              // kens are found. \noexpand allows for macros that would normally expand to be
              // treated like a primitive in that they will match with any other unexpandable
              // command.
              var token = e.mouth.eat('pre space');
  
              if (!token) {
                this.invalid = true;
                e.mouth.loadState(ifSym);
                return [this];
              } else if (token.type == 'character' && token.cat == catcodes.WHITESPACE && tokens.length == 0) {
                // Whitespace isn't allowed right after the \if command, but IS allowed after one
                // of the tokens have been parsed.
                continue;
              } else if (token.type == 'character' && tokens.cat != catcodes.ACTIVE) {
                tokens.push(token);
                noexpand = false;
              } else if (noexpand) {
                tokens.push(token);
                noexpand = false;
              } else if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
                // If the command refers to a register, it is kept unexpanded and added to the list
                // of tokens immediately.
                if (token.name in e.scopes.last().registers.named) {
                  tokens.push(token);
                  continue;
                }
  
                // A macro or active character was found. Look up its definition first.
                var macro = token.type == 'command' ? e.scopes.last().defs.primitive[token.name] || e.scopes.last().defs.macros[token.name] : e.scopes.last().defs.active[token.char];
  
                // If it doesn't have a definition, return invalid.
                if (!macro) {
                  this.invalid = true;
                  e.mouth.loadState(ifSym);
                  return [this];
                }
                // If an expandable primitive is found, expand it to get some tokens.
                if ((macro === data.defs.primitive.the          || macro.proxy && macro.original === data.defs.primitive.the)          ||
                  (macro === data.defs.primitive.expandafter  || macro.proxy && macro.original === data.defs.primitive.expandafter)  ||
                  (macro === data.defs.primitive.number       || macro.proxy && macro.original === data.defs.primitive.number)       ||
                  (macro === data.defs.primitive.romannumeral || macro.proxy && macro.original === data.defs.primitive.romannumeral) ||
                  (macro === data.defs.primitive.csname       || macro.proxy && macro.original === data.defs.primitive.csname)       ||
                  (macro === data.defs.primitive.string       || macro.proxy && macro.original === data.defs.primitive.string)       ||
                  (macro === data.defs.primitive.if           || macro.isLet && macro.original === data.defs.primitive.if)           ||
                  (macro === data.defs.primitive.ifcase       || macro.isLet && macro.original === data.defs.primitive.ifcase)       ||
                  (macro === data.defs.primitive.ifcat        || macro.isLet && macro.original === data.defs.primitive.ifcat)        ||
                  (macro === data.defs.primitive.ifdim        || macro.isLet && macro.original === data.defs.primitive.ifdim)        ||
                  (macro === data.defs.primitive.ifeof        || macro.isLet && macro.original === data.defs.primitive.ifeof)        ||
                  (macro === data.defs.primitive.iffalse      || macro.isLet && macro.original === data.defs.primitive.iffalse)      ||
                  (macro === data.defs.primitive.ifodd        || macro.isLet && macro.original === data.defs.primitive.ifodd)        ||
                  (macro === data.defs.primitive.ifnum        || macro.isLet && macro.original === data.defs.primitive.ifnum)        ||
                  (macro === data.defs.primitive.ifhmode      || macro.isLet && macro.original === data.defs.primitive.ifhmode)      ||
                  (macro === data.defs.primitive.ifinner      || macro.isLet && macro.original === data.defs.primitive.ifinner)      ||
                  (macro === data.defs.primitive.ifmmode      || macro.isLet && macro.original === data.defs.primitive.ifmmode)      ||
                  (macro === data.defs.primitive.iftrue       || macro.isLet && macro.original === data.defs.primitive.iftrue)       ||
                  (macro === data.defs.primitive.ifvmode      || macro.isLet && macro.original === data.defs.primitive.ifvmode)      ||
                  (macro === data.defs.primitive.ifvoid       || macro.isLet && macro.original === data.defs.primitive.ifvoid)       ||
                  (macro === data.defs.primitive.ifx          || macro.isLet && macro.original === data.defs.primitive.ifx)) {
                  var expansion = e.mouth.expand(token, e.mouth);
                  if (expansion.length == 1 && expansion[0] === token && token.invalid) {
                    this.invalid = true;
                    e.mouth.loadState(ifSym);
                    return [this];
                  }
                  e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
                  continue;
                } else if (macro === data.defs.primitive.noexpand || macro.proxy && macro.original === data.defs.primitive.noexpand) {
                  noexpand = true;
                  continue;
                }
  
                // If the macro is any other primitive, don't expand it. Add it directly to the to-
                // ken list.
                if (macro instanceof Primitive || macro.proxy && macro.original instanceof Primitive) {
                  tokens.push(token);
                  continue;
                }
  
                // If it's actually a macro, then it has to be expanded. \edef has its own version
                // `Mouth.expand' since it needs to take care of parameter tokens (#), but that's
                // not the case here. Instead, the regular `expand' function is used.
                var expansion = e.mouth.expand(token, e.mouth);
                if (expansion.length == 1 && expansion[0] ==- token && token.invalid) {
                  this.invalid = true;
                  e.mouth.loadState(ifSym);
                  return [this];
                }
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              } else tokens.push(token);
            }
  
            // Since there are so many \if commands and they all end up doing the same thing
            // (either using the the true replacement text or the false text), an `evalIf' fun-
            // tion is used.
            return evalIf.call(this, tokens[0].type == 'command' && tokens[1].type == 'command' || tokens[0].type == 'character' && tokens[0].char == tokens[1].char, e.mouth, e.scopes, ifSym);
          }),
          ifcase: new Primitive('ifcase', function(e) {
            // \ifcase is a special version of \if that works like a `switch' in JavaScript.
            // \ifcase will expect an integer after it. Then, there will be `case's that are
            // executed depending on the value of the integer. For example, \ifcase 2 <case 0>
            // \or <case 1> \or <case 2> \else <default> \fi. The \else acts like the `default'
            // case in a JavaScript `switch'. This is the only "special" version of \if that
            // accepts \or cases. All the other ones work similar to the regular \if in that
            // they only allow \else and \fi.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var ifSym = Symbol();
            e.mouth.saveState(ifSym);
  
            // The integer to be checked is gotten first.
            var int = e.mouth.eat('integer');
            if (!int) {
              this.invalid = true;
              return [this];
            }
  
            // `int' is the number of the case to expand. To look for that case, the "\or" com-
            // mand is looked for `int' amount of times. If the case isn't found, the "\else"
            // looked for. If there is no "\else", nothing is expanded.
  
            // `isElse' is a boolean that tells whether the current context for the \ifcase is
            // inside an \or inside \else. If it's in an \or block, then finding another \or
            // command is valid TeX and means it's the end of the expansion. If it's in an
            // \else block though, \or is invalid. `isElse' is set inside the `evalIf' function
            // below since that's where token skipping is evaluated.
            var tokens = [],
              isElse = false;
            int = int.value;
            // If `int' is negative, only the \else is evaluated.
            if (int < 0) skipUntil('else');
            else {
              for (; int > 0 && !isElse; int--) skipUntil('or');
            }
  
            while (true) {
              var token = e.mouth.eat();
  
              if (!token) {
                this.invalid = true;
                e.mouth.loadState(stateSymbol);
                return [this];
              } else if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
                var macro = token.type == 'command' ? e.scopes.last().defs.primitive[token.name] || e.scopes.last().defs.macros[token.name] : e.scopes.last().defs.active[token.char];
                // There is no \else special if block here because it should have already been e-
                // valuated. Instead, it's expanded naturally, which will mark it as invalid for
                // being in the wrong context.
                if (macro && (macro === data.defs.primitive.fi || macro.isLet && macro.original === data.defs.primitive.fi)) return tokens;
                else if (!isElse && macro && (macro === data.defs.primitive.or || macro.isLet && macro.original === data.defs.primitive.or || macro === data.defs.primitive.else || macro.isLet && macro.original === data.defs.primitive.else)) {
                  skipUntil('fi');
                  continue;
                }
                var expansion = e.mouth.expand(token, e.mouth);
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              } else {
                tokens.push(token);
              }
            }
  
            // This is like the same function from `evalIf' except it looks for \or as well.
            function skipUntil(elseOrFi) {
              while (true) {
                var token = e.mouth.eat();
  
                if (!token) {
                  return;
                } else if (token.type == 'command' || token.type == 'character' && token.cat === catcodes.ACTIVE) {
                  var macro = token.type == 'command' ? e.scopes.last().defs.primitive[token.name] || e.scopes.last().defs.macros[token.name] : e.scopes.last().defs.active[token.char];
  
                  if (!macro) continue;
  
                  // Test if the macro is a \if (or \let to be one). If it is, `skipUntil' is called
                  // recursively until a \fi is found. Then it'll return to the current level of
                  // skipping.
                  if ((macro === data.defs.primitive.if      || macro.isLet && macro.original === data.defs.primitive.if)      ||
                    (macro === data.defs.primitive.ifcase  || macro.isLet && macro.original === data.defs.primitive.ifcase)  ||
                    (macro === data.defs.primitive.ifcat   || macro.isLet && macro.original === data.defs.primitive.ifcat)   ||
                    (macro === data.defs.primitive.ifdim   || macro.isLet && macro.original === data.defs.primitive.ifdim)   ||
                    (macro === data.defs.primitive.ifeof   || macro.isLet && macro.original === data.defs.primitive.ifeof)   ||
                    (macro === data.defs.primitive.iffalse || macro.isLet && macro.original === data.defs.primitive.iffalse) ||
                    (macro === data.defs.primitive.ifodd   || macro.isLet && macro.original === data.defs.primitive.ifodd)   ||
                    (macro === data.defs.primitive.ifnum   || macro.isLet && macro.original === data.defs.primitive.ifnum)   ||
                    (macro === data.defs.primitive.ifhmode || macro.isLet && macro.original === data.defs.primitive.ifhmode) ||
                    (macro === data.defs.primitive.ifinner || macro.isLet && macro.original === data.defs.primitive.ifinner) ||
                    (macro === data.defs.primitive.ifmmode || macro.isLet && macro.original === data.defs.primitive.ifmmode) ||
                    (macro === data.defs.primitive.iftrue  || macro.isLet && macro.original === data.defs.primitive.iftrue)  ||
                    (macro === data.defs.primitive.ifvmode || macro.isLet && macro.original === data.defs.primitive.ifvmode) ||
                    (macro === data.defs.primitive.ifvoid  || macro.isLet && macro.original === data.defs.primitive.ifvoid)  ||
                    (macro === data.defs.primitive.ifx     || macro.isLet && macro.original === data.defs.primitive.ifx)) {
  
                    // `skipUntil' is called to look for the closing \fi.
                    skipUntil('fi');
                    // `skipUntil' does not absorb the \fi token, so it has to be eaten manually. If
                    // there was no \fi token, then there must be NO tokens left, so `mouth.eat()'
                    // won't do anything and the missing tokens will be token care of on the next loop.
                    e.mouth.eat();
                    continue;
                  }
  
                  // Now, if `elseOrFi' is "or", then check for an \or token. If an \or IS found, it
                  // is absorbed and the function returns.
                  if (elseOrFi == 'or' && (macro === data.defs.primitive.or || macro.isLet && macro.original === data.defs.primitive.or)) {
                    return;
                  }
  
                  // If a \else is found and `elseOrFi' is "or", it counts as an \or. `ifElse' is set
                  // to true to signify the context is \else, not \or.
                  if ((elseOrFi == 'or' || elseOrFi == 'else') && (macro === data.defs.primitive.else || macro.isLet && macro.original === data.defs.primitive.else)) {
                    isElse = true;
                    return;
                  }
  
                  // If a \fi is found, the \fi is put back and the function returns.
                  if (macro === data.defs.primitive.fi || macro.isLet && macro.original === data.defs.primitive.fi) {
                    e.mouth.revert();
                    return;
                  }
                }
              }
            }
          }),
          ifcat: new Primitive('ifcat', function(e) {
            // \ifcat behaves exactly like \if except that only the catcodes are checked indep-
            // endent of the characters.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var ifSym = Symbol();
            e.mouth.saveState(ifSym);
  
            // First, the tokens after the \ifcat have to be expanded, similar to how \edef re-
            // cursively expands tokens.
            var tokens = [],
              noexpand = false;
            while (tokens.length < 2) {
              // Tokens are eaten and expanded recursively until the first two unexpandable to-
              // kens are found. \noexpand allows for macros that would normally expand to be
              // treated like a primitive in that they will match with any other unexpandable
              // command.
              var token = e.mouth.eat('pre space');
  
              if (!token) {
                this.invalid = true;
                e.mouth.loadState(ifSym);
                return [this];
              } else if (token.type == 'character' && token.cat == catcodes.WHITESPACE && tokens.length == 0) {
                // Whitespace isn't allowed right after the \if command, but IS allowed after one
                // of the tokens have been parsed.
                continue;
              } else if (token.type == 'character' && tokens.cat != catcodes.ACTIVE) {
                tokens.push(token);
                noexpand = false;
              } else if (noexpand) {
                tokens.push(token);
                noexpand = false;
              } else if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
                // If the command refers to a register, it is kept unexpanded and added to the list
                // of tokens immediately.
                if (token.name in e.scopes.last().registers.named) {
                  tokens.push(token);
                  continue;
                }
  
                // A macro or active character was found. Look up its definition first.
                var macro = token.type == 'command' ? e.scopes.last().defs.primitive[token.name] || e.scopes.last().defs.macros[token.name] : e.scopes.last().defs.active[token.char];
  
                // If it doesn't have a definition, return invalid.
                if (!macro) {
                  this.invalid = true;
                  e.mouth.loadState(ifSym);
                  return [this];
                }
                // If an expandable primitive is found, expand it to get some tokens.
                if ((macro === data.defs.primitive.the          || macro.proxy && macro.original === data.defs.primitive.the)          ||
                  (macro === data.defs.primitive.expandafter  || macro.proxy && macro.original === data.defs.primitive.expandafter)  ||
                  (macro === data.defs.primitive.number       || macro.proxy && macro.original === data.defs.primitive.number)       ||
                  (macro === data.defs.primitive.romannumeral || macro.proxy && macro.original === data.defs.primitive.romannumeral) ||
                  (macro === data.defs.primitive.csname       || macro.proxy && macro.original === data.defs.primitive.csname)       ||
                  (macro === data.defs.primitive.string       || macro.proxy && macro.original === data.defs.primitive.string)       ||
                  (macro === data.defs.primitive.if           || macro.isLet && macro.original === data.defs.primitive.if)           ||
                  (macro === data.defs.primitive.ifcase       || macro.isLet && macro.original === data.defs.primitive.ifcase)       ||
                  (macro === data.defs.primitive.ifcat        || macro.isLet && macro.original === data.defs.primitive.ifcat)        ||
                  (macro === data.defs.primitive.ifdim        || macro.isLet && macro.original === data.defs.primitive.ifdim)        ||
                  (macro === data.defs.primitive.ifeof        || macro.isLet && macro.original === data.defs.primitive.ifeof)        ||
                  (macro === data.defs.primitive.iffalse      || macro.isLet && macro.original === data.defs.primitive.iffalse)      ||
                  (macro === data.defs.primitive.ifodd        || macro.isLet && macro.original === data.defs.primitive.ifodd)        ||
                  (macro === data.defs.primitive.ifnum        || macro.isLet && macro.original === data.defs.primitive.ifnum)        ||
                  (macro === data.defs.primitive.ifhmode      || macro.isLet && macro.original === data.defs.primitive.ifhmode)      ||
                  (macro === data.defs.primitive.ifinner      || macro.isLet && macro.original === data.defs.primitive.ifinner)      ||
                  (macro === data.defs.primitive.ifmmode      || macro.isLet && macro.original === data.defs.primitive.ifmmode)      ||
                  (macro === data.defs.primitive.iftrue       || macro.isLet && macro.original === data.defs.primitive.iftrue)       ||
                  (macro === data.defs.primitive.ifvmode      || macro.isLet && macro.original === data.defs.primitive.ifvmode)      ||
                  (macro === data.defs.primitive.ifvoid       || macro.isLet && macro.original === data.defs.primitive.ifvoid)       ||
                  (macro === data.defs.primitive.ifx          || macro.isLet && macro.original === data.defs.primitive.ifx)) {
                  var expansion = e.mouth.expand(token, e.mouth);
                  if (expansion.length == 1 && expansion[0] === token && token.invalid) {
                    this.invalid = true;
                    e.mouth.loadState(ifSym);
                    return [this];
                  }
                  e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
                  continue;
                } else if (macro === data.defs.primitive.noexpand || macro.proxy && macro.original === data.defs.primitive.noexpand) {
                  noexpand = true;
                  continue;
                }
  
                // If the macro is any other primitive, don't expand it. Add it directly to the to-
                // ken list.
                if (macro instanceof Primitive || macro.proxy && macro.original instanceof Primitive) {
                  tokens.push(token);
                  continue;
                }
  
                // If it's actually a macro, then it has to be expanded. \edef has its own version
                // `Mouth.expand' since it needs to take care of parameter tokens (#), but that's
                // not the case here. Instead, the regular `expand' function is used.
                var expansion = e.mouth.expand(token, e.mouth);
                if (expansion.length == 1 && expansion[0] ==- token && token.invalid) {
                  this.invalid = true;
                  e.mouth.loadState(ifSym);
                  return [this];
                }
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              } else tokens.push(token);
            }
  
            // Now compare the catcode of the two tokens. If they're both commands, they match
            // "catcodes" even though they don't have actual catcodes.
            return evalIf.call(this, tokens[0].type == 'command' && tokens[1].type == 'command' || tokens[0].type == 'character' && tokens[0].cat == tokens[1].cat, e.mouth, e.scopes, ifSym);
          }),
          ifdim: new Primitive('ifdim', function(e) {
            // \ifdim compares dimensions using a relational operator (<, >, or =). The syntax
            // is \ifdim<dimension><operator><dimension>. If the tokens don't match the syntax,
            // the \ifdim token is returned invalid.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var ifSym = Symbol();
            e.mouth.saveState(ifSym);
  
            // First, a dimension token is looked for.
            var dim1 = e.mouth.eat('dimension');
            if (!dim1) {
              this.invalid = true;
              return [this];
            }
            dim1 = dim1.sp.value + dim1.em.value * 12;
  
            // The operator is either "<", "=", or ">" and controls how the two dimensions are
            // compared.
            var operator = e.mouth.eat();
            if (!operator || (operator.cat == catcodes.ACTIVE && (operator.char == '<' || operator.char == '=' || operator.char == '>'))) {
              this.invalid = true;
              e.mouth.loadState(ifSym);
              return [this];
            }
  
            // The second dimension is looked for now to be compared with the first later.
            var dim2 = e.mouth.eat('dimension');
            if (!dim2) {
              this.invalid = true;
              e.mouth.loadState(ifSym);
              return [this];
            }
            dim2 = dim2.sp.value + dim2.em.value * 12;
  
            return evalIf.call(this, operator.char == '<' ? dim1 < dim2 : operator.char == '=' ? dim1 == dim2 : dim1 > dim2, e.mouth, e.scopes, ifSym);
          }),
          ifeof: new Primitive('ifeof', function(e) {
            // Streams don't exist, so this primitive is 100% obsolete here and will always re-
            // turn true. It's basically the same as \iftrue. It's only included for consisten-
            // cy with real TeX.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var sym = Symbol();
            e.mouth.saveState(sym);
  
            return evalIf.call(this, true, e.mouth, e.scopes, sym);
          }),
          iffalse: new Primitive('iffalse', function(e) {
            // This version of \if will ALWAYS evaluate to false. If there is an \else block,
            // the code inside that will be executed. Otherwise, the \if block is skipped over
            // and nothing happens. The reason it exists is for \newif and for when you need a
            // \let that will evaluate to a falsy value. There is also an \iftrue command that
            // does the complete opposite of this command.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var sym = Symbol();
            e.mouth.saveState(sym);
  
            return evalIf.call(this, false, e.mouth, e.scopes, sym);
          }),
          ifodd: new Primitive('ifodd', function(e) {
            // \ifodd checks if the next integer is odd.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var ifSym = Symbol();
            e.mouth.saveState(ifSym);
  
            // The integer to be checked is gotten first.
            var int = e.mouth.eat('integer');
            if (!int) {
              this.invalid = true;
              return [this];
            }
  
            return evalIf.call(this, int.value % 2 == 1, e.mouth, e.scopes, ifSym);
          }),
          ifnum: new Primitive('ifnum', function(e) {
            // \ifnum is the integer version of \ifdim. It will compare two integers using the
            // three relational operator <, >, and =.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var ifSym = Symbol();
            e.mouth.saveState(ifSym);
  
            // First, an integer token is looked for.
            var int1 = e.mouth.eat('integer');
            if (!int1) {
              this.invalid = true;
              return [this];
            }
  
            // The operator is either "<", "=", or ">" and controls how the two integers are
            // compared.
            var operator = e.mouth.eat();
            if (!operator || (operator.cat == catcodes.ACTIVE && (operator.char == '<' || operator.char == '=' || operator.char == '>'))) {
              this.invalid = true;
              e.mouth.loadState(ifSym);
              return [this];
            }
  
            // The second integer is looked for now to be compared with the first later.
            var int2 = e.mouth.eat('integer');
            if (!int2) {
              this.invalid = true;
              e.mouth.loadState(ifSym);
              return [this];
            }
  
            return evalIf.call(this, operator.char == '<' ? int1.value < int2.value : operator.char == '=' ? int1.value == int2.value : int1.value > int2.value, e.mouth, e.scopes, ifSym);
          }),
          ifhmode: new Primitive('ifhmode', function(e) {
            // Normally, \ifhmode will check if TeX is in horizontal mode. This version of TeX
            // though is always in math mode, so this is always false. It's synonymous with
            // \iffalse.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var sym = Symbol();
            e.mouth.saveState(sym);
  
            return evalIf.call(this, false, e.mouth, e.scopes, sym);
          }),
          ifinner: new Primitive('ifinner', function(e) {
            // This checks if the current math context is inline or displayed. Displayed math
            // contexts are delimited by "$$" (or "\[") while inline ones are delimited by $
            // (or "\("). It doesn't matter if a \displaystyle-type command has changed the
            // style. $$\textstyle ... $$ still counts as displayed and \ifinner would return
            // false in that case, even though it's in inline style mode.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var sym = Symbol();
            e.mouth.saveState(sym);
  
            return evalIf.call(this, e.style == 'inline', e.mouth, e.scopes, sym);
          }),
          ifmmode: new Primitive('ifmmode', function(e) {
            // This is supposed to check if TeX is in math mode. It's ALWAYS in math mode here
            // though, so this is always true.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var sym = Symbol();
            e.mouth.saveState(sym);
  
            return evalIf.call(this, true, e.mouth, e.scopes, sym);
          }),
          iftrue: new Primitive('iftrue', function(e) {
            // The exact opposite of \iffalse.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var sym = Symbol();
            e.mouth.saveState(sym);
  
            return evalIf.call(this, true, e.mouth, e.scopes, sym);
          }),
          ifvmode: new Primitive('ifvmode', function(e) {
            // \ifvmode checks for vertical mode, which is never true in this version of TeX.
            // This is always false.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var sym = Symbol();
            e.mouth.saveState(sym);
  
            return evalIf.call(this, false, e.mouth, e.scopes, sym);
          }),
          ifvoid: new Primitive('ifvoid', function(e) {
            // \ifvoid would normally check if a box is empty. Boxes though don't exist here
            // because everything is rendered in HTML. This is always true.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var sym = Symbol();
            e.mouth.saveState(sym);
  
            return evalIf.call(this, true, e.mouth, e.scopes, sym);
          }),
          ifx: new Primitive('ifx', function(e) {
            // \ifx compares characters and catcodes. If the two tokens are both characters,
            // they must be the same exact token to evaluate to true. \ifx does not expand
            // macros though. If two macros are found, their top-level expansion is compared.
            // If \def\a{\b} \def\b{\d} \def\c{\d}, \ifx\b\c is true, but \ifx\a\b is false.
            // Even though \a's top level expansion is \b, \b's top level expansion is \c. \b
            // and \c are what are compared, which evaluates to false.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var ifSym = Symbol();
            e.mouth.saveState(ifSym);
  
            // The first two tokens are compared without expansion.
            var token1 = e.mouth.eat();
            if (!token1) {
              this.invalid = true;
              return [this];
            }
  
            var token2 = e.mouth.eat('pre space');
            if (!token2) {
              this.invalid = true;
              e.mouth.loadState(ifSym);
              return [this];
            }
  
            // Command tokens are expanded to their corresponding macros/primitives.
            token1 = token1.type == 'command' ? e.scopes.last().defs.primitive[token1.name] || e.scopes.last().defs.macros[token1.name] :
                 token1.type == 'character' && token1.cat == catcodes.ACTIVE ? e.scopes.last().defs.active[token1.char] :
                 token1;
            if (token1 && token1.proxy) token1 = token1.original;
            token2 = token2.type == 'command' ? e.scopes.last().defs.primitive[token2.name] || e.scopes.last().defs.macros[token2.name] :
                 token2.type == 'character' && token2.cat == catcodes.ACTIVE ? e.scopes.last().defs.active[token2.char] :
                 token2;
            if (token2 && token2.proxy) token2 = token2.original;
  
            // If both tokens were command, but don't have definitions, then they count as
            // matching and the \ifx evaluates to true.
            if (!token1 && !token2) return evalIf.call(this, true, e.mouth, e.scopes, ifSym);
            // If only one token is undefined, then it must not be a match and it has to eval-
            // uate to false. This also gets rid of any errors later pertaining to getting
            // properties on `undefined'. Also, if the types on the tokens don't match, then it
            // must also evaluate to false.
            if (!token1 || !token2 || token1.type != token2.type) return evalIf.call(this, false, e.mouth, e.scopes, ifSym);
            // Now, if the two tokens are character, compare charCodes and catcodes.
            if (token1.type == 'character') return evalIf.call(this, token1.char == token2.char && token1.cat == token2.cat, e.mouth, e.scopes, ifSym);
            // If the two tokens are primitives, check that they reference the same thing.
            if (token1.type == 'primitive') return evalIf.call(this, token1 === token2, e.mouth, e.scopes, ifSym);
            // The two tokens must be macros. Their parameter and replacement tokens have to be
            // compared. Check that their tokens first off at least have the same length.
            if (token1.parameters.length != token2.parameters.length || token1.replacement.length != token2.replacement.length) return evalIf.call(this, false, e.mouth, e.scopes, ifSym);
            // Now each token in the first token's parameters is compared with the correspond-
            // ing token in the second token's parameters. If a command token is found, only
            // the name of the token is compared, not what it expands to. For example, if
            // \def\cmdone{hi} \let\cmdtwo=\cmdone and those two tokens are compared against
            // each other, it will evaluate to false. Even though \cmdtwo is essentially exact-
            // ly the same as \cmdone, only the names are checked. That makes sense considering
            // macros are expanded later and \cmdtwo may be equal to \cmdone now, but may be
            // different when the macro is actually expanded.
            for (var i = 0, l = token1.parameters.length; i < l; i++) {
              if (token1.parameters[i].type == 'character' && token1.parameters[i].char == token2.parameters[i].char && token1.parameters[i].cat == token2.parameters[i].cat) {
                // If the two are character tokens and their charCodes and catcodes agree, then
                // move on to the next token.
                continue;
              } else if (token1.parameters[i].type == 'command' && token1.parameters[i].name == token2.parameters[i].name) {
                // If the two are both command tokens and their names agree, then move on to the
                // next token.
                continue;
              } else {
                // This means that the tokens didn't agree, which means the two macros didn't match
                // and that the \ifx evaluates to false.
                return evalIf.call(this, false, e.mouth, e.scopes, ifSym);
              }
            }
            // If all the parameter tokens agree, now the replacement tokens need to be checked
            // as well in the same way.
            for (var i = 0, l = token1.replacement.length; i < l; i++) {
              if (token1.replacement[i].type == 'character' && token1.replacement[i].char == token2.replacement[i].char && token1.replacement[i].cat == token2.replacement[i].cat) continue;
              else if (token1.replacement[i].type == 'command' && token1.replacement[i].name == token2.replacement[i].name) continue;
              else return evalIf.call(this, false, e.mouth, e.scopes, ifSym);
            }
            // If both the parameters and replacement tokens all agree, then the two must have
            // the same top level expansion and the \ifx evaluates to true.
            return evalIf.call(this, true, e.mouth, e.scopes, ifSym);
          }),
          it: new Primitive('it', function(e) {
            // \it makes all the characters in the rest of the scope italic and unbolded.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'font modifier',
              value: 'it'
            });
            return [];
          }),
          kern: new Primitive('kern', function(e) {
            // \kern creates spacing between the last atom and the next atom to be parsed. It
            // only accepts non-mu dimensions and can even be negative to make atoms overlap
            // each other. \mkern is the mu dimension equivalent of \kern.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var dimen = e.mouth.eat('dimension');
            if (!dimen) {
              this.invalid = true;
              return [this];
            }
            e.tokens.push({
              type: 'kern',
              dimen: dimen
            });
            return [];
          }),
          lccode: new Primitive('lccode', function(e) {
            // \lccode takes an integer argument. That integer is converted to a character (via code
            // point) and the lowercase value for that character is gotten. An integer register is
            // returned with the code point of that lowercase character. This can be used to set lo-
            // wercase values of characters that ordinarily wouldn't have a lowercase value. For exam-
            // ple, \lccode`\C="00A2 will set the lowercase value of C to the cents character. Next
            // time C is used in a \lowercase, it will be replaced with the cents character instead of
            // "c".
  
            if (e.contexts.last == "superscript" || e.contexts.last == "subscript") {
              this.invalid = true;
              return [this];
            }
  
            let integer = e.mouth.eat("integer");
  
            if (integer && integer.value > 0) {
              return [e.scopes.last().lc[integer.value] = e.scopes.last().lc[integer.value] || new IntegerReg(0)];
            } else {
              this.invalid = true;
              return [this];
            }
          }),
          left: new Primitive('left', function(e) {
            // \left must be followed by a delimiter. It creates a new group (Scope) and ex-
            // pands the delimiters to the height of the subformula.
  
            // First make sure no superscript or subscript context is open.
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var leftSym = Symbol();
            e.mouth.saveState(leftSym);
  
            while (true) {
              // Look for a delimiter by expanding any macros found.
              var token = e.mouth.eat();
  
              if (token && (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE)) {
                var expansion = e.mouth.expand(token, e.mouth);
  
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              } else if (token && token.type == 'character' && data.delims.includes(token.code) && (token.cat == catcodes.OTHER || token.cat == catcodes.LETTER)) {
                new e.Scope();
                e.scopes.last().delimited = true;
                e.scopes.last().leftDelimiter = token.char;
                e.scopes.last().nullDelimiterSpace = new DimenReg(e.scopes.last().registers.named.nulldelimiterspace);
                e.openGroups.push(this);
                e.contexts.push({
                  toString: () => 'scope',
                  type: "scope"
                });
                e.scopes.last().tokens.push(this);
                e.scopes.last().tokens.push({
                  type: 'atom',
                  atomType: 0,
                  nucleus: {
                    type: 'symbol',
                    char: token.char,
                    code: token.code
                  },
                  subscript: null,
                  superscript: null
                });
                this.ignore = true;
                break;
              } else {
                this.invalid = true;
                e.mouth.loadState(leftSym);
                return [this];
              }
            }
          }),
          let: new Primitive('let', function(e) {
            // \let is used to copy macros to new macros. It's different from \def in that the
            // macro's DEFINITION is copied, not the macro itself. Even if the old macro is
            // changed, the new macro holds the same macro definition. A lot of the code below
            // is copied from \def since they're almost the same.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var letSym = Symbol();
            e.mouth.saveState(letSym);
  
            var name = e.mouth.eat();
            if (!name) {
              this.invalid = true;
              return [this];
            }
            var type;
            if (name.type == 'character') {
              if (e.catOf(name.char) == catcodes.ACTIVE) {
                type = 'active';
                name = name.char;
              } else {
                this.invalid = true;
                e.mouth.loadState(letSym);
                return [this];
              }
            } else if (name.type == 'command') {
              type = 'macro';
              name = name.name;
              if (name in e.scopes.last().defs.primitive || name in data.parameters) {
                this.invalid = true;
                e.mouth.loadState(letSym);
                return [this];
              }
            }
  
            var optEquals = e.mouth.eat();
            if (!optEquals || optEquals.type != 'character' || optEquals.char != '=' || optEquals.cat != catcodes.OTHER) optEquals && e.mouth.revert();
  
            var token = e.mouth.eat();
  
            if (!token) {
              this.invalid = true;
              e.mouth.loadState(letSym);
              return [this];
            } else if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
              var macro = token.type == 'command' ? e.scopes.last().defs.primitive[token.name] || e.scopes.last().defs.macros[token.name] : e.scopes.last().defs.active[token.name];
              if (macro) macro = new Macro(macro, macro.type == 'primitive' || macro.isLet);
              else if (token.type == 'command' && type == 'macro') {
                // Check if the command refers to a register.
                var reg = e.scopes.last().registers.named[token.name];
                if (reg) {
                  // If it does, make a new entry in the named registers.
                  if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
                    data.registers.named[name] = reg;
                    delete data.defs.macros[name];
                    for (var i = 0, l = e.scopes.length; i < l; i++) {
                      e.scopes[i].registers.named[name] = reg;
                      delete e.scopes[i].defs.macros[name];
                    }
                  } else {
                    e.scopes.last().registers.named[name] = reg;
                    delete e.scopes.last().defs.macros[name];
                  }
                  e.toggles.global = false;
                  return [];
                }
              }
            } else {
              // There are two calls to new Macro so that the macro is recognized as a proxy.
              var macro = new Macro(new Macro([token]), true);
            }
  
            if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
              if (type == 'macro') {
                if (macro) data.defs.macros[name] = macro;
                else delete data.defs.macros[name];
                delete data.registers.named[name];
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  if (macro) e.scopes[i].defs.macros[name] = macro;
                  else delete e.scopes[i].defs.macros[name];
                  delete e.scopes[i].registers.named[name];
                }
              } else {
                if (macro) data.defs.active[name] = macro;
                else delete data.defs.active[name];
                delete data.registers.named[name];
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  if (macro) e.scopes[i].defs.active[name] = macro;
                  else delete e.scopes[i].defs.active[name];
                  delete e.scopes[i].registers[name];
                }
              }
            } else {
              if (macro) e.scopes.last().defs[type == 'macro' ? 'macros' : 'active'][name] = macro;
              else delete e.scopes.last().defs[type == 'macro' ? 'macros' : 'active'][name];
              delete e.scopes.last().registers.named[name];
            }
  
            e.toggles.global = false;
  
            return [];
          }),
          limits: new Primitive('limits', function(e) {
            // \limits is like \displaylimits in that it controls where superscripts and sub-
            // scripts are rendered. Instead of depending on the current style though, it will
            // always render the limits above or below the atom, even if the style isn't dis-
            // play.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'limit modifier',
              value: true,
              token: this
            });
            return [];
          }),
          lower: new Primitive('lower', function(e) {
            // In TeX, normally, \lower will lower the next box by the specified dimension.
            // In this version, it'll lower the next thing, whether that be an atom, a box,
            // a table, anything. That's because \hbox and \vbox is just barely implemented
            // here, so it would kinda suck having to make a box every time. This is basic-
            // ally a vertical version of \kern except it affects only the next token instead
            // of everything.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var dimen = e.mouth.eat('dimension');
            if (!dimen) {
              this.invalid = true;
              return [this];
            }
            // Since \lower makes items go down (negative height), the dimension is inverted to
            // have negated values.
            dimen.sp.value *= -1;
            dimen.em.value *= -1;
            e.tokens.push({
              type: 'vkern',
              dimen: dimen
            });
            return [];
          }),
          lowercase: new Primitive('lowercase', function(e) {
            // \lowercase takes one argument (MUST be delimited by opening and closing tokens)
            // and scans all the tokens inside it. Any character tokens (command tokens are ig-
            // nored) are converted to their lowercase value according to their \lccode value.
            // Only the character's character value is changed, not its catcode value. If you
            // lowercase an "f" into a "1" (you'd have to change its \lccode), then the result-
            // ing "1" would still have the catcode of "f" (usually 11).
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var lcSym = Symbol();
            e.mouth.saveState(lcSym);
  
            var open = e.mouth.eat('pre space');
            if (!open || open.cat != catcodes.OPEN) {
              this.invalid = true;
              e.mouth.loadState(lcSym);
              return [this];
            }
  
            var tokens = [],
              groups = 1;
            while (true) {
              var token = e.mouth.eat('pre space');
  
              if (!token) {
                this.invalid = true;
                e.mouth.loadState(lcSym);
                return [this];
              } else if (token.type == 'character' && token.cat == catcodes.OPEN) {
                groups++;
                tokens.push(token);
              } else if (token.type == 'character' && token.cat == catcodes.CLOSE) {
                groups--;
                if (groups > 0) tokens.push(token);
                else break;
              } else tokens.push(token);
            }
  
            for (var i = 0, l = tokens.length; i < l; i++) {
              if (tokens[i].type == 'character' && e.scopes.last().lc[tokens[i].code] && e.scopes.last().lc[tokens[i].code].value > 0) {
                tokens[i].code = e.scopes.last().lc[tokens[i].code].value;
                tokens[i].char = String.fromCharCode(tokens[i].code);
              }
            }
            return tokens;
          }),
          mathbin: new Primitive('mathbin', function(e) {
            // \mathbin (and \mathclose, \mathinner, \mathop, \mathopen, \mathord, \mathpunct,
            // and \mathrel) create a temporary token that will change the next atom after it.
            // The next atom will inherit the spacing for a Bin atom, even if it normally
            // wouldn't. This applies to the other \math[family] commands listed above. Bin
            // atoms of course might still be replaced with Ord atoms if the context isn't
            // right for a Bin atom, but that's the only exception where one of these commands
            // won't work as intended.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            // All \mathbin, \mathclose, ... , \mathrel commands work like \accent. A temporary
            // token is created and resolved later.
            e.tokens.push({
              type: 'family modifier',
              value: 2,
              token: this
            });
            return [];
          }),
          mathchar: new Primitive('mathchar', function(e) {
            // \mathchar works the same as \char except the first number is interpreted as the
            // family number. Since the number is usually passed as hexadecimal, the first num-
            // ber (read as base 16) is used as the family number. The other digits of the
            // number are used as the character code.
  
            var charCode = e.mouth.eat('integer');
            if (!charCode || charCode.value < 0) {
              this.invalid = true;
              return [this];
            }
  
            if (charCode.value < 65536) var family = 0;
            else if (charCode.value < 524288) {
              var code = charCode.value % 65536;
              var family = (charCode.value - code) / 65536;
              charCode.value = code;
            } else var family = 0;
  
            // The token will be parsed and put into a nucleus/superscript/subscript naturally.
            e.mouth.queue.unshift({
              type: 'character',
              cat: catcodes.OTHER,
              char: String.fromCharCode(charCode.value),
              code: charCode.value,
              forcedMathCode: family
            });
            return [];
          }),
          mathchardef: new Primitive('mathchardef', function(e) {
            // A combination of \mathchar and \chardef.
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var charDefSym = Symbol();
            e.mouth.saveState(charDefSym);
            var name = e.mouth.eat();
  
            if (name && name.type == 'command') {
              if (name.name in data.defs.primitive || name.name in data.parameters) {
                this.invalid = true;
                e.mouth.loadState(charDefSym);
                return [true];
              }
              var optEquals = e.mouth.eat();
              if (!optEquals || optEquals.type != 'character' || optEquals.char != '=' || optEquals.cat != catcodes.OTHER) optEquals && e.mouth.revert();
              var integer = e.mouth.eat('integer');
              if (!integer || integer.value < 0) {
                this.invalid = true;
                e.mouth.loadState(charDefSym);
                return [true];
              }
  
              if (integer.value < 65536) var family = 0;
              else if (integer.value < 524288) {
                var code = integer.value % 65536;
                var family = (integer.value - code) / 65536;
                integer.value = code;
              } else var family = 0;
  
              var macro = new Macro([{
                type: 'character',
                cat: catcodes.OTHER,
                char: String.fromCharCode(integer.value),
                code: integer.value,
                forcedMathCode: family
              }], []);
              if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
                data.defs.macros[name.name] = macro;
                delete data.registers.named[name.name];
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].defs.macros[name.name] = macro;
                  delete e.scopes[i].registers.named[name.name];
                }
              } else {
                e.scopes.last().defs.macros[name.name] = macro;
                delete e.scopes.last().registers.named[name.name];
              }
              e.toggles.global = false;
            } else {
              this.invalid = true;
              e.mouth.loadState(charDefSym);
              return [true];
            }
          }),
          mathchoice: new Primitive('mathchoice', function(e) {
            // \mathchoice takes four arguments. Each one is a list of tokens. The first is
            // used if \displaystyle is being used. The second for \textstyle, the third for
            // \scriptstyle, and the fourth for \scriptscriptstyle. Since we won't know the
            // real style until the TeX is actually rendered, we can't just take four arguments
            // ans spit one out like a regular macro. Instead, a special token has to be made
            // that will survive until it's rendered. Once it gets there, one of the four argu-
            // ments will be chosen and rendered. We can't just take four arguments and store
            // them as regular symbols though; they have to be parsed like normal tokens. To
            // do that, a new special context is made called "mathchoice". It'll actually be
            // a JSON object so that it can store data, but still be able to evaluate to
            // "mathchoice" so it can be compared like a regular string. Since the four argu-
            // ments must be surrounded in opening and closing tokens and be right next to each
            // other (only non-atom characters like whitespace and comments can be between
            // them), no tokens are allowed between the groups. That means if any token is
            // being parsed with the last context == "mathchoice", the \mathchoice fails alto-
            // gether. Token withing groups will have a last context of "scope".
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var token = {
              type: 'command',
              nameType: 'command',
              escapeChar: this.escapeChar,
              name: 'mathchoice',
              recognized: true
            };
            e.contexts.push({
              toString: function() {return 'mathchoice'},
              type: "mathchoice",
              token: token,
              current: 0,
              failed: function() {
                // This function will get called if a token is found in the wrong place and the
                // \mathchoice failed.
  
                this.token.invalid = true;
                e.contexts.pop();
              },
              succeeded: function() {
                // This will get called if all four groups were found successfully and the context
                // needs to be closed.
                e.contexts.pop();
                this.token.type = 'mathchoice';
                // The four grouped tokens that were made need to be removed from the token list so
                // that they don't all get rendered.
                this.token.groups = e.scopes.last().tokens.splice(e.scopes.last().tokens.length - 4, 4);
                this.token.ignore = false;
              }
            });
            e.tokens.push(token);
            token.ignore = true;
          }),
          mathclose: new Primitive('mathclose', function(e) {
            // Look at the description of \mathbin.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'family modifier',
              value: 5,
              token: this
            });
            return [];
          }),
          mathcode: new Primitive("mathcode", function(e) {
            // \mathcode is like \catcode. It returns the mathcode of a character, which is mostly in
            // charge of how characters are spaced (it also lets you have active character that still
            // behave like regular character).
  
            if (e.lastContext.type == "superscript" || e.lastContext.type == "subscript") {
              return fail(this);
            }
  
            let codePoint = e.mouth.eat("integer");
  
            if (codePoint && codePoint.value >= 0) {
              if (!(codePoint.value in data.mathcodes)) {
                data.mathcodes[codePoint.value] = new IntegerReg(atomTypes.ORD, 0, 8);
                for (let i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].mathcodes[codePoint.value] =
                      new IntegerReg((i == 0 ? data : e.scopes[i - 1]).mathcodes[codePoint.value]);
                }
              }
              return [e.lastScope.mathcodes[codePoint.value]];
            } else {
              return fail(this);
            }
          }),
          mathinner: new Primitive('mathinner', function(e) {
            // Look at the description of \mathbin.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'family modifier',
              value: 'inner', // Family 7 is reserved for variables. The literal string "inner" is used here instead.
              token: this
            });
            return [];
          }),
          mathop: new Primitive('mathop', function(e) {
            // Look at the description of \mathbin.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'family modifier',
              value: 1,
              token: this
            });
            return [];
          }),
          mathopen: new Primitive('mathopen', function(e) {
            // Look at the description of \mathbin.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'family modifier',
              value: 4,
              token: this
            });
            return [];
          }),
          mathord: new Primitive('mathord', function(e) {
            // Look at the description of \mathbin.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'family modifier',
              value: 0,
              token: this
            });
            return [];
          }),
          mathpunct: new Primitive('mathpunct', function(e) {
            // Look at the description of \mathpunct.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'family modifier',
              value: 6,
              token: this
            });
            return [];
          }),
          mathrel: new Primitive('mathrel', function(e) {
            // Look at the description of \mathrel.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'family modifier',
              value: 3,
              token: this
            });
            return [];
          }),
          meaning: new Primitive("meaning", function(e) {
            // \meaning does the same thing as \show except the output is put directly into the input
            // stream instead of the console. 
            if (e.contexts.last == "superscript" || e.contexts.last == "subscript") {
              this.invalid = true;
              return [this];
            }
  
            let preString = e.mouth.string;
            let token = e.mouth.eat();
  
            if (!token) {
              this.invalid = true;
              return [this];
            }
  
            let string = "";
            let alreadyExpanded = false;
  
            if (token.type == "command" || token.type == "character" &&
                token.cat == catcodes.ACTIVE) {
              let macro = token.type == "command" ?
                  e.scopes[e.scopes.length - 1].defs.primitive[token.name] ||
                  e.scopes[e.scopes.length - 1].defs.macros[token.name] :
                  e.scopes[e.scopes.length - 1].defs.active[token.char];
  
              if (!macro) {
                string += `${token.escapeChar}${token.name}=undefined.`;
                alreadyExpanded = true;
              } else if (macro.type == "primitive" || macro.isLet &&
                  macro.original.type == "primitive") {
                string += `${
                  token.escapeChar
                }${
                  token.name
                }=${
                  String.fromCodePoint(e.scopes[e.scopes.length - 1].registers.named.escapechar.value)
                }${
                  (macro.original || macro).name
                }`;
                alreadyExpanded = true;
              } else if (macro.isLet) {
                string += `${(token.escapeChar + token.name) || token.char}=`;
                token = macro.original.replacement[0];
              } else {
                if (macro.proxy) {
                  macro = macro.original;
                }
                string += `${(token.escapeChar + token.name) || token.char}=macro:\n`;
                let paramNum = 0;
                for (let i = 0, l = macro.parameters.length; i < l; i++) {
                  if (macro.parameters[i].type == "character" &&
                      macro.parameters[i].cat != catcodes.PARAMETER) {
                    string += macro.parameters[i].char;
                  } else if (macro.parameters[i].type == "character") {
                    paramNum++;
                    string += macro.parameters[i].char + paramNum;
                  } else {
                    string += macro.parameters[i].escapeChar + macro.parameters[i].name;
                  }
                }
                string += "->";
                for (let i = 0, l = macro.replacement.length; i < l; i++) {
                  string += macro.replacement[i].type == "character" ?
                    macro.replacement[i].char :
                    macro.replacement[i].escapeChar + macro.replacement[i].name;
                }
                alreadyExpanded = true;
              }
            }
  
            if (!alreadyExpanded) {
              switch (token.cat) {
                case catcodes.OPEN:
                  string += `begin-group character ${token.char}.`;
                  break;
                case catcodes.CLOSE:
                  string += `end-group character ${token.char}.`;
                  break;
                case catcodes.MATHSHIFT:
                  string += `math shift character ${token.char}.`;
                  break;
                case catcodes.ALIGN:
                  string += `alignment tab character ${token.char}.`;
                  break;
                case catcodes.PARAMETER:
                  string += `macro parameter character ${token.char}.`;
                  break;
                case catcodes.SUPERSCRIPT:
                  string += `superscript character ${token.char}.`;
                  break;
                case catcodes.SUBSCRIPT:
                  string += `subscript character ${token.char}.`;
                  break;
                case catcodes.WHITESPACE:
                  string += `blank space ${token.char}.`;
                  break;
                case catcodes.LETTER:
                  string += `the letter ${token.char}.`;
                  break;
                case catcodes.OTHER:
                default:
                  string += `the character ${token.char}.`;
                  break;
              }
            }
  
            return string.replace(/\n/g, " ").split("").map(element => ({
              type: "character",
              cat: catcodes.OTHER,
              char: element,
              code: element.codePointAt(0)
            }));
          }),
          message: new Primitive('message', function(e) {
            // \message writes text directly to the console. The argument immediately after it
            // must be delimited by opening and closing tokens.
  
            var errSym = Symbol();
            e.mouth.saveState(errSym);
  
            var token = e.mouth.eat();
            if (!token || token.type != 'character' || token.cat != catcodes.OPEN) {
              this.invalid = true;
              return [this];
            } else {
              var openGroups = 0,
                tokens = [];
              while (true) {
                var token = e.mouth.eat('pre space');
  
                if (!token) {
                  this.invalid = true;
                  e.mouth.loadState(errSym);
                  return [this];
                } else if (token.type == 'character' && token.cat == catcodes.OPEN) {
                  openGroups++;
                  tokens.push(token.char);
                } else if (token.type == 'character' && token.cat == catcodes.CLOSE) {
                  if (!openGroups) break;
                  openGroups--;
                  tokens.push(token.char);
                } else if (token.type == 'command') {
                  tokens.push(token.escapeChar);
                  tokens.push.apply(tokens, token.name.split(''));
                } else {
                  tokens.push(token.char);
                }
              }
              consoleMessage(tokens.join(''));
            }
          }),
          mkern: new Primitive('mkern', function(e) {
            // Mu dimension version of \kern.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var dimen = e.mouth.eat('mu dimension');
            if (!dimen) {
              this.invalid = true;
              return [this];
            }
            e.tokens.push({
              type: 'kern',
              dimen: dimen
            });
            return [];
          }),
          month: new Primitive('month', function(e) {
            // Returns the current month in the range [1,12].
  
            return [new IntegerReg(new Date().getMonth() + 1)];
          }),
          mskip: new Primitive('mskip', function(e) {
            // Mu glue version of \hskip.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var glue = e.mouth.eat('mu glue');
            if (!glue) {
              this.invalid = true;
              return [this];
            }
            e.tokens.push({
              type: 'glue',
              glue: glue
            });
            return [];
          }),
          multiply: new Primitive('multiply', function(e) {
            // \multiply multiplies a register by a specified value.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var multiplySym = Symbol();
            e.mouth.saveState(multiplySym);
  
            while (true) {
              var register = e.mouth.eat();
  
              if (register && (register.type == 'command' || register.type == 'character' && register.cat == catcodes.ACTIVE)) {
                var expansion = e.mouth.expand(register, e.mouth);
  
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              } else if (register && register.register) {
                if (register && register.register) {
                  var token = e.mouth.eat();
  
                  if (token && token.type == 'character' && (token.char == 'b' || token.char == 'B') && token.cat != catcodes.ACTIVE) {
                    var y = e.mouth.eat();
                    if (!(y && y.type == 'character' && (y.char == 'y' || y.char == 'Y') && y.cat != catcodes.ACTIVE)) e.mouth.revert(2);
                  } else if (token) e.mouth.revert();
                  else {
                    this.invalid = true;
                    e.mouth.loadState(multiplySym);
                    return [this];
                  }
  
                  var multiplier = e.mouth.eat('integer');
  
                  if (multiplier) {
                    if (register.type == 'integer') {
                      register.value *= multiplier.value;
                      var reg = register;
                      if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
                        while (register.parent) {
                          register = register.parent;
                          register.value = reg.value;
                        }
                      }
                      e.toggles.global = false;
                    } else if (register.type == 'dimension') {
                      register.sp.value *= multiplier.value;
                      register.em.value *= multiplier.value;
                      var reg = register;
                      if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
                        while (register.parent) {
                          register = register.parent;
                          register.sp.value = reg.sp.value;
                          register.em.value = reg.em.value;
                        }
                      }
                      e.toggles.global = false;
                    } else if (register.type == 'mu dimension') {
                      register.mu.value *= multiplier.value;
                      var reg = register;
                      if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
                        while (register.parent) {
                          register = register.parent;
                          register.mu.value = reg.mu.value;
                        }
                      }
                      e.toggles.global = false;
                    } else if (register.type == 'glue') {
                      register.start.sp.value *= multiplier.value;
                      register.start.em.value *= multiplier.value;
                      if (register.stretch.type == 'infinite dimension') register.stretch.number.value *= multiplier.value;
                      else {
                        register.stretch.sp.value *= multiplier.value;
                        register.stretch.em.value *= multiplier.value;
                      }
                      if (register.shrink.type == 'infinite dimension') register.shrink.number.value *= multiplier.value;
                      else {
                        register.shrink.sp.value *= multiplier.value;
                        register.shrink.em.value *= multiplier.value;
                      }
                      var reg = register;
                      if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
                        while (register.parent) {
                          register = register.parent;
                          register.start.sp.value = reg.start.sp.value;
                          register.start.em.value = reg.start.em.value;
                          if (reg.stretch.type == 'infinite dimension') register.stretch = new InfDimen(reg.stretch.number.value, reg.stretch.magnitude.value);
                          else register.stretch = new DimenReg(reg.stretch.sp.value, reg.stretch.em.value);
                          if (reg.shrink.type == 'infinite dimension') register.shrink = new InfDimen(reg.shrink.number.value, reg.shrink.magnitude.value);
                          else register.shrink = new DimenReg(reg.shrink.sp.value, reg.shrink.em.value);
                        }
                      }
                      e.toggles.global = false;
                    } else if (register.type == 'mu glue') {
                      register.start.mu.value *= multiplier.value;
                      if (register.stretch.type == 'infinite dimension') register.stretch.number.value *= multiplier.value;
                      else register.stretch.mu.value *= multiplier.value;
                      if (register.shrink.type == 'infinite dimension') register.shrink.number.value *= multiplier.value;
                      else register.shrink.mu.value *= multiplier.value;
                      var reg = register;
                      if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
                        while (register.parent) {
                          register = register.parent;
                          register.start.mu.value = reg.start.mu.value;
                          if (reg.stretch.type == 'infinite dimension') register.stretch = new InfDimen(reg.stretch.number.value, reg.stretch.magnitude.value);
                          else register.stretch = new MuDimenReg(reg.stretch.mu.value);
                          if (reg.shrink.type == 'infinite dimension') register.shrink = new InfDimen(reg.shrink.number.value, reg.shrink.magnitude.value);
                          else register.shrink = new MuDimenReg(reg.shrink.mu.value);
                        }
                      }
                      e.toggles.global = false;
                    }
                  } else {
                    this.invalid = true;
                    e.mouth.loadState(multiplySym);
                    return [this];
                  }
                  break;
                } else {
                  this.invalid = true;
                  e.mouth.loadState(multiplySym);
                  return [this]
                }
              } else {
                this.invalid = true;
                e.mouth.loadState(multiplySym);
                return [this];
              }
            }
            return [];
          }),
          muskip: new Primitive('muskip', function(e) {
            // Returns the mu glue register at the specified index.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var muglue = e.mouth.eat('integer');
            if (!muglue || muglue.value < 0) {
              this.invalid = true;
              return [this];
            }
            if (!data.registers.muskip[muglue.value]) {
              data.registers.muskip[muglue.value] = new MuGlueReg(new MuDimenReg(0, 0), new MuDimenReg(0, 0), new MuDimenReg(0, 0));
              for (var i = 0, l = e.scopes.length; i < l; i++) {
                e.scopes[i].registers.muskip[muglue.value] = new MuGlueReg((i ? e.scopes[i - 1] : data).registers.muskip[muglue.value]);
              }
            }
            return [e.scopes.last().registers.muskip[muglue.value]];
          }),
          muskipdef: new Primitive('muskipdef', function(e) {
            // Mu glue version of \countdef.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var skipDefSym = Symbol();
            e.mouth.saveState(skipDefSym);
            var name = e.mouth.eat();
  
            if (name.type == 'command') {
              if (name.name in data.defs.primitive || name.name in data.parameters) {
                this.invalid = true;
                e.mouth.loadState(skipDefSym);
                return [true];
              }
              var optEquals = e.mouth.eat();
              if (!optEquals || optEquals.type != 'character' || optEquals.char != '=' || optEquals.cat != catcodes.OTHER) optEquals && e.mouth.revert();
              var integer = e.mouth.eat('integer');
              if (!integer || integer.value < 0) {
                this.invalid = true;
                e.mouth.loadState(skipDefSym);
                return [true];
              }
              name = name.name;
              integer = integer.value;
              if (!data.registers.muskip[integer]) {
                data.registers.muskip[integer] = new MuGlueReg(new MuDimenReg(0), new MuDimenReg(0), new MuDimenReg(0));
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].registers.muskip[integer] = new MuGlueReg((i ? e.scopes[i - 1] : data).registers.muskip[integer]);
                }
              }
              if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
                data.registers.named[name] = data.registers.muskip[integer];
                delete data.defs.macros[name];
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].registers.named[name] = e.scopes[i].registers.muskip[integer];
                  delete e.scopes[i].defs.macros[name];
                }
              } else {
                e.scopes.last().registers.named[name] = e.scopes.last().registers.muskip[integer];
                delete e.scopes.last().defs.macros[name];
              }
            } else {
              this.invalid = true;
              e.mouth.loadState(countDefSym);
              return [true];
            }
          }),
          noalign: new Primitive('noalign', function(e) {
            // \noalign is handled entirely in \cr.
  
            this.invalid = true;
            return [this];
          }),
          noexpand: new Primitive('noexpand', function(e) {
            // \noexpand has no use outside of a \edef or \xdef. It is only used to signal that
            // the next token should not be expanded. Outside of a \edef, a command HAS to be
            // expanded. Since \edef and \xdef handle \noexpand themselves without calling it,
            // this function will only be called outside of a definition. If a command follows
            // noexpand, the \noexpand will be marked as invalid. If a regular character fol-
            // lows it, then nothing happens; the \noexpand will be ignored and the non-command
            // token will carry on (since it's not being expanded, just read).
  
            var token = e.mouth.eat();
            if (!token) {
              this.invalid = true;
              return [this];
            }
            e.mouth.revert();
            if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
              this.invalid = true;
              return [this];
            }
            return [];
          }),
          nolimits: new Primitive('nolimits', function(e) {
            // The opposite of \limits.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'limit modifier',
              value: false,
              token: this
            });
            return [];
          }),
          nonscript: new Primitive('nonscript', function(e) {
            // \nonscript basically has the effect of canceling out the next kern or glue item.
            // If it's followed by a kern or glue, and the style is in script or scriptscript
            // (caused by \scriptstyle, scriptscriptstyle, or being inside a superscript or
            // subscript), then the kern/glue that follows is removed from the token list. If
            // there is no kern or glue after it, it's not marked as invalid; nothing happens
            // in that case.
  
            // Mu glue version of \hskip.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'glue',
              isNonScript: true
            });
            return [];
          }),
          normalfont: new Primitive('normalfont', function(e) {
            // \normalfont makes all the characters in the rest of the scope back to the normal
            // math font (upright characters except for those in the variable math family).
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'font modifier',
              value: 'nm'
            });
            return [];
          }),
          number: new Primitive('number', function(e) {
            // \number is basically a specialized version of \the. It returns a list of tokens,
            // but only for numbers (\the works for any type of register).
  
            var integer = e.mouth.eat('integer');
            if (!integer) {
              this.invalid = true;
              return [this];
            }
  
            return integer.value.toString().split('').map(function(element) {
              return {
                type: 'character',
                cat: catcodes.OTHER,
                char: element,
                code: element.charCodeAt(0)
              };
            });
          }),
          of: new Primitive('of', function(e) {
            // This is the second part of \root. It isn't even a macro by itself in TeX, but
            // it's necessary here for the other part of \root. If a \root is open, then it's
            // closed and turned into a \radical. If a \root isn't open, it's marked as inval-
            // id.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            if (e.scopes.last().root) {
              var index = e.scopes.last().tokens.indexOf(e.scopes.last().root);
              e.tokens.push({
                type: 'family modifier',
                value: 'rad',
                index: e.scopes.last().tokens.splice(index, e.scopes.last().tokens.length - index + 1).slice(1),
                token: this
              });
              e.scopes.last().root = false;
              return [];
            } else {
              this.invalid = true;
              return [this];
            }
          }),
          omit: new Primitive('omit', function(e) {
            // \omit is used in \halign and is handled elsewhere (after a \cr or alignment to-
            // ken).
  
            this.invalid = true;
            return [this];
          }),
          or: new Primitive('or', function(e) {
            // \or is only allowed inside \ifcase blocks. \or is handled in there, so this
            // function is only called when in an invalid context.
  
            this.invalid = true;
            return [this];
          }),
          over: new Primitive('over', function(e) {
            // Works the same as \above except the fraction bar's width is generated from the
            // font's | character's visible width. It guesses the fraction bar so that it will
            // change with the font to look as natural as possible. A thick-looking font should
            // have a thick-looking bar.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            // Mark the last scope as a fraction.
            e.scopes.last().isFrac = true;
  
            // Every fraction has delimiters that act like \left and \right delimiters. In the
            // case of \above, it has empty delimiters, which are just period tokens. You can
            // use \abovewithdelims to change the delimiters.
            e.scopes.last().fracLeftDelim = e.scopes.last().fracRightDelim = '.';
  
            e.scopes.last().barWidth = 'from font';
  
            if (e.scopes.last().root) {
              e.scopes.last().root.invalid = true;
              e.scopes.last().root = false;
            }
  
            e.scopes.last().fracNumerator = e.scopes.last().tokens;
            e.scopes.last().tokens = [];
  
            return [];
          }),
          overline: new Primitive('overline', function(e) {
            // \overline adds a bar over the next atom. It's similar to \mathbin and its re-
            // lated commands, except \overline renders the atom as Ord. The bar's width is de-
            // termined from the "|" character's visible width.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'family modifier',
              value: 'over',
              token: this
            });
            return [];
          }),
          overwithdelims: new Primitive('overwithdelims', function(e) {
            // Combination of \over and \abovewithdelims.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var overDelimsSym = Symbol();
            e.mouth.saveState(overDelimsSym);
  
            while (true) {
              var token = e.mouth.eat();
  
              if (token && (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE)) {
                var expansion = e.mouth.expand(token, e.mouth);
  
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              } else if (token && token.type == 'character' && data.delims.includes(token.code) && (token.cat == catcodes.OTHER || token.cat == catcodes.LETTER)) {
                if (e.scopes.last().fracLeftDelim) {
                  e.scopes.last().fracRightDelim = token.char;
                  break;
                } else {
                  e.scopes.last().fracLeftDelim = token.char;
                }
              } else {
                this.invalid = true;
                e.mouth.loadState(overDelimsSym);
                delete e.scopes.last().fracLeftDelim;
                return [this];
              }
            }
  
            e.scopes.last().isFrac = true;
  
            e.scopes.last().barWidth = 'from font';
  
            if (e.scopes.last().root) {
              e.scopes.last().root.invalid = true;
              e.scopes.last().root = false;
            }
  
            e.scopes.last().fracNumerator = e.scopes.last().tokens;
            e.scopes.last().tokens = [];
  
            return [];
          }),
          phantom: new Primitive('phantom', function(e) {
            // \phantom makes the next atom's nucleus invisible. It will still take up the same
            // amount of space as if it was visible, but it will have opacity: 0.
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'family modifier',
              value: 'phantom',
              index: [],
              token: this
            });
            return [];
          }),
          raise: new Primitive('raise', function(e) {
            // \raise is the exact opposite of \lower. It'll raise the next token by a specif-
            // ied dimension.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var dimen = e.mouth.eat('dimension');
            if (!dimen) {
              this.invalid = true;
              return [this];
            }
            e.tokens.push({
              type: 'vkern',
              dimen: dimen
            });
            return [];
          }),
          relax: new Primitive('relax', function(e) {
            // \relax literally does nothing. It's only real use is to end token scanning early
            // when searching for a glue object or other type of register. For example, if a
            // macro is made with \def\cmd{\skip0=1pt}, then you would expect it to set the 0th
            // skip register to a glue with a start of 1pt and a stretch and shrink of 0pt. But
            // if you called it as "\cmd plus 1pt", then \cmd would be expanded and the text
            // would read "\skip0=1pt plus 1pt". Notice that the " plus 1pt" is now being
            // parsed as part of the glue, even though it wasn't originally meant to. If you
            // change the macro however to \def\cmd{\skip0=1pt\relax}, then it would expand out
            // to "\skip0=1pt\relax plus 1pt". Notice that the \relax breaks up the "1pt" and
            // the " plus 1pt" so that the glue will be set correctly and the " plus 1pt" will
            // be parsed as their own independent tokens. Other than that, \relax expands to
            // nothing and is literally skipped over like it didn't exist.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            return [];
          }),
          right: new Primitive('right', function(e) {
            // \right is the closer for \left. It also must be followed by a delimiter.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            // First, check if the last group actually exists and was opened by a \left.
            if (!e.openGroups.length || !e.scopes.last().delimited || e.scopes.last().isHalign || e.scopes.last().isHalignCell || e.scopes.last().semisimple) {
              this.invalid = true;
              return [this];
            }
  
            var rightSym = Symbol();
            e.mouth.saveState(rightSym);
  
            while (true) {
              var token = e.mouth.eat();
  
              if (token && (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE)) {
                var expansion = e.mouth.expand(token, e.mouth);
  
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              } else if (token && token.type == 'character' && data.delims.includes(token.code) && (token.cat == catcodes.OTHER || token.cat == catcodes.LETTER)) {
                if (e.contexts.last != 'scope') {
                  this.invalid = true;
                  e.mouth.loadState(rightSym);
                  return [this];
                }
                e.openGroups.pop();
                e.contexts.pop();
                var tokens = e.scopes.last().tokens;
  
                if (e.scopes.last().root) e.scopes.last().root.invalid = true;
  
                if (e.scopes.last().isFrac) {
                  // These two shifts get rid of the "\left" token and the left delimiter token.
                  e.scopes.last().fracNumerator.shift();
                  e.scopes.last().fracNumerator.shift();
                  e.scopes[e.scopes.length - 2].tokens.push({
                    type: 'atom',
                    atomType: 'inner',
                    nucleus: [{
                      type: 'fraction',
                      numerator: e.scopes.last().fracNumerator,
                      denominator: tokens,
                      barWidth: e.scopes.last().barWidth,
                      delims: [e.scopes.last().fracLeftDelim, e.scopes.last().fracRightDelim],
                      nullDelimiterSpace: new DimenReg(e.scopes.last().registers.named.nulldelimiterspace)
                    }],
                    superscript: null,
                    subscript: null,
                    delimited: true,
                    nullDelimiterSpace: new DimenReg(e.scopes.last().registers.named.nulldelimiterspace),
                    delims: [e.scopes.last().leftDelimiter, token.char]
                  });
                  e.scopes.pop();
                } else {
                  tokens.shift();
                  tokens.shift();
                  var leftDelim = e.scopes.last().leftDelimiter;
                  e.scopes.pop();
                  e.scopes.last().tokens.push({
                    type: 'atom',
                    atomType: 'inner',
                    nucleus: tokens,
                    superscript: null,
                    subscript: null,
                    delimited: true,
                    nullDelimiterSpace: new DimenReg(e.scopes.last().registers.named.nulldelimiterspace),
                    delims: [leftDelim, token.char]
                  });
                }
                break;
              } else {
                this.invalid = true;
                e.mouth.loadState(rightSym);
                return [this];
              }
            }
          }),
          rm: new Primitive('rm', function(e) {
            // \rm makes all the characters in the rest of the scope upright and unbolded.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'font modifier',
              value: 'rm'
            });
            return [];
          }),
          romannumeral: new Primitive('romannumeral', function(e) {
            // \romannumeral is like \number, except the tokens returned are in the form of ro-
            // man numerals (M, D, C, L, X, V, or I). Roman numerals only go up to 1000. After
            // that, they are supposed to be overlined to indicate x1000. TeX though, even
            // though overline atoms exist, doesn't do that. Instead, it returns an extra "m"
            // for every 1000 that goes over. That same behavior is mirrored here. Negative
            // numbers and 0 are not allowed and will return invalid. All tokens are returned
            // lowercase and can be made capital via \uppercase.
  
            var integer = e.mouth.eat('integer');
            if (!integer) {
              this.invalid = true;
              return [this];
            }
            if (integer.value <= 0) {
              this.invalid = true;
              e.mouth.revert();
              return [this];
            }
  
            var chars = '';
            integer = integer.value;
            var M = ~~(integer / 1000);
            integer %= 1000;
            var C = ~~(integer / 100);
            integer %= 100;
            var X = ~~(integer / 10);
            var I = integer % 10;
  
            chars = new Array(M + 1).join('m');
            if (C < 3) chars += new Array(C + 1).join('c');
            else if (C == 4) chars += 'cd';
            else if (C < 9) chars += 'd' + new Array(C % 5 + 1).join('c');
            else chars += 'cm';
            if (X < 3) chars += new Array(X + 1).join('x');
            else if (X == 4) chars += 'xl';
            else if (X < 9) chars += 'l' + new Array(X % 5 + 1).join('x');
            else chars += 'xc';
            if (I < 3) chars += new Array(I + 1).join('i');
            else if (I == 4) chars += 'iv';
            else if (I < 9) chars += 'v' + new Array(I % 5 + 1).join('i');
            else chars += 'ix';
  
            return chars.split('').map(function(element) {
              return {
                type: 'character',
                cat: catcodes.OTHER,
                char: element,
                code: element.charCodeAt(0)
              };
            });
          }),
          scriptscriptstyle: new Primitive('scriptscriptstyle', function(e) {
            // \scriptscriptstyle makes all the characters in the rest of the scope appear like
            // the superscript/subscript of a superscript/subscript.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'font modifier',
              value: 'scriptscriptstyle'
            });
            return [];
          }),
          scriptstyle: new Primitive('scriptstyle', function(e) {
            // \scriptstyle makes all the characters in the rest of the scope appear as it's
            // the superscript or subscript of an inline equation.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'font modifier',
              value: 'scriptstyle'
            });
            return [];
          }),
          show: new Primitive("show", function(e) {
            // \show is a special type of primitive because it would normally send text to the term-
            // inal in TeX. In this version, the closest JavaScript has to a terminal is the browser's
            // console. \show will eat the next token and show it in the console. If it's a character
            // token, the character will be shown along with its catcode (e.g. \show a => "the letter
            // a", \show# => "macro parameter character #"). If the token is a command, its top level
            // expansion will be shown instead. Primitive commands expand to themselves though so
            // that's all it'll show. If the command name is undefined, the literal text "undefined"
            // will be shown. Active characters like ~ are shown as their expansion, not their cat-
            // code. This primitive will only send text to the console and expands to nothing.
  
            if (e.contexts.last == "superscript" || e.contexts.last == "subscript") {
              this.invalid = true;
              return [this];
            }
  
            let preString = e.mouth.string;
            let token = e.mouth.eat();
  
            if (!token) {
              this.invalid = true;
              return [this];
            }
  
            // Show the part of the string that called \show. For example: "\show\TeX" will show the
            // string '"\show\TeX":\n' to indicate why this text is in the console.
            let string = `"${
              this.escapeChar
            }${
              this.name
            }${
              preString.substring(0, preString.length - e.mouth.string.length)
            }":\n`;
  
            if (token.type == "command" || token.type == "character" &&
                token.cat == catcodes.ACTIVE) {
              let macro = token.type == "command" ?
                  e.scopes[e.scopes.length - 1].defs.primitive[token.name] ||
                  e.scopes[e.scopes.length - 1].defs.macros[token.name] :
                  e.scopes[e.scopes.length - 1].defs.active[token.char];
  
              if (!macro) {
                consoleMessage(`${string}${token.escapeChar}${token.name}=undefined.`);
                return [];
              } else if (macro.type == "primitive" || macro.isLet &&
                  macro.original.type == "primitive") {
                consoleMessage(`${
                  string
                }${
                  token.escapeChar
                }${
                  token.name
                }=${
                  String.fromCodePoint(e.scopes[e.scopes.length - 1].registers.named.escapechar.value)
                }${
                  (macro.original || macro).name
                }`);
                return [];
              } else if (macro.isLet) {
                string += `${(token.escapeChar + token.name) || token.char}=`;
                token = macro.original.replacement[0];
              } else {
                if (macro.proxy) {
                  macro = macro.original;
                }
                string += `${(token.escapeChar + token.name) || token.char}=macro:\n`;
                let paramNum = 0;
                for (let i = 0, l = macro.parameters.length; i < l; i++) {
                  if (macro.parameters[i].type == "character" &&
                      macro.parameters[i].cat != catcodes.PARAMETER) {
                    string += macro.parameters[i].char;
                  } else if (macro.parameters[i].type == "character") {
                    paramNum++;
                    string += macro.parameters[i].char + paramNum;
                  } else {
                    string += macro.parameters[i].escapeChar + macro.parameters[i].name;
                  }
                }
                string += "->";
                for (let i = 0, l = macro.replacement.length; i < l; i++) {
                  string += macro.replacement[i].type == "character" ?
                    macro.replacement[i].char :
                    macro.replacement[i].escapeChar + macro.replacement[i].name;
                }
                consoleMessage(string);
                return [];
              }
            }
            // This isn't enclosed in an if block because if a \let command was passed that evaluates
            // to a character (e.g. \bgroup), even though it's a command token, it should be shown as
            // a character token.
            switch (token.cat) {
              case catcodes.OPEN:
                consoleMessage(`${string}begin-group character ${token.char}.`);
                break;
              case catcodes.CLOSE:
                consoleMessage(`${string}end-group character ${token.char}.`);
                break;
              case catcodes.MATHSHIFT:
                consoleMessage(`${string}math shift character ${token.char}.`);
                break;
              case catcodes.ALIGN:
                consoleMessage(`${string}alignment tab character ${token.char}.`);
                break;
              case catcodes.PARAMETER:
                consoleMessage(`${string}macro parameter character ${token.char}.`);
                break;
              case catcodes.SUPERSCRIPT:
                consoleMessage(`${string}superscript character ${token.char}.`);
                break;
              case catcodes.SUBSCRIPT:
                consoleMessage(`${string}subscript character ${token.char}.`);
                break;
              case catcodes.WHITESPACE:
                consoleMessage(`${string}blank space ${token.char}.`);
                break;
              case catcodes.LETTER:
                consoleMessage(`${string}the letter ${token.char}.`);
                break;
              case catcodes.OTHER:
              default:
                consoleMessage(`${string}the character ${token.char}.`);
                break;
            }
            return [];
          }),
          showthe: new Primitive('showthe', function(e) {
            // This command is like \show except that it shows the value of registers. If you
            // do \show\count0, the result will be showing "\count=\count" instead of showing
            // the value at the 0th register. \showthe\count0 however will evaluate the \count
            // and show the value at the 0th count register. The code below is copied from \the
            // so look there for comments.
  
            var theSym = Symbol()
            e.mouth.saveState(theSym);
            while (true) {
              var token = e.mouth.eat();
              if (token && (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE)) {
                var expansion = e.mouth.expand(token, e.mouth);
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              } else if (token && token.register) {
                if (token.type == 'integer') {
                  consoleMessage(token.value + '.');
                } else if (token.type == 'dimension') {
                  var pts = Math.round(token.sp.value / 65536 * 100000) / 100000;
                  pts += (Math.round(token.em.value / 65536 * 100000) / 100000) * 12;
                  consoleMessage(pts + (Number.isInteger(pts) ? '.0pt.' : 'pt.'))
                } else if (token.type == 'mu dimension') {
                  var mus = Math.round(token.mu.value / 65536 * 100000) / 100000;
                  consoleMessage(mus + (Number.isInteger(mus) ? '.0mu.' : 'mu.'))
                } else if (token.type == 'glue') {
                  var string = '',
                    pts = Math.round(token.start.sp.value / 65536 * 100000) / 100000;
                    pts += (Math.round(token.start.em.value / 65536 * 100000) / 100000) * 12;
                  string = pts + (Number.isInteger(pts) ? '.0pt' : 'pt');
                  if (token.stretch instanceof DimenReg && (token.stretch.sp.value || token.stretch.em.value)) {
                    pts = Math.round(token.stretch.sp.value / 65536 * 100000) / 100000;
                    pts += (Math.round(token.stretch.em.value / 65536 * 100000) / 100000) * 12;
                    string += ' plus ' + pts + (Number.isInteger(pts) ? '.0pt' : 'pt');
                  } else if (token.stretch instanceof InfDimen && token.stretch.number.value) {
                    var fils = Math.round(token.stretch.number.value / 65536 * 100000) / 100000;
                    string += ' plus ' + fils + (Number.isInteger(fils) ? '.0' : '') + 'fil' + new Array(token.stretch.magnitude.value).join('l');
                  }
                  if (token.shrink instanceof DimenReg && (token.shrink.sp.value || token.shrink.em.value)) {
                    pts = Math.round(token.shrink.sp.value / 65536 * 100000) / 100000;
                    pts += (Math.round(token.shrink.em.value / 65536 * 100000) / 100000) * 12;
                    string += ' minus ' + pts + (Number.isInteger(pts) ? '.0pt' : 'pt');
                  } else if (token.shrink instanceof InfDimen && token.shrink.number.value) {
                    var fils = Math.round(token.shrink.number.value / 65536 * 100000) / 100000;
                    string += ' minus ' + fils + (Number.isInteger(fils) ? '.0' : '') + 'fil' + new Array(token.shrink.magnitude.value).join('l');
                  }
                  consoleMessage(string + '.');
                } else if (token.type == 'mu glue') {
                  var string = '',
                    mus = Math.round(token.start.mu.value / 65536 * 100000) / 100000;
                  string = mus + (Number.isInteger(mus) ? '.0mu' : 'mu');
                  if (token.stretch instanceof MuDimenReg && token.stretch.mu.value) {
                    mus = Math.round(token.stretch.mu.value / 65536 * 100000) / 100000;
                    string += ' plus ' + mus + (Number.isInteger(mus) ? '.0mu' : 'mu');
                  } else if (token.stretch instanceof InfDimen && token.stretch.number.value) {
                    var fils = Math.round(token.stretch.number.value / 65536 * 100000) / 100000;
                    string += ' plus ' + fils + (Number.isInteger(fils) ? '.0' : '') + 'fil' + new Array(token.stretch.magnitude.value).join('l');
                  }
                  if (token.shrink instanceof MuDimenReg && token.shrink.mu.value) {
                    mus = Math.round(token.shrink.mu.value / 65536 * 100000) / 100000;
                    string += ' minus ' + mus + (Number.isInteger(mus) ? '.0mu' : 'mu');
                  } else if (token.shrink instanceof InfDimen && token.shrink.number.value) {
                    var fils = Math.round(token.shrink.number.value / 65536 * 100000) / 100000;
                    string += ' minus ' + fils + (Number.isInteger(fils) ? '.0' : '') + 'fil' + new Array(token.shrink.magnitude.value).join('l');
                  }
                  consoleMessage(string + '.');
                }
                return [];
              } else {
                this.invalid = true;
                e.mouth.loadState(theSym);
                return [this];
              }
            }
          }),
          skip: new Primitive('skip', function(e) {
            // Returns the glue register at the specified index.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var glue = e.mouth.eat('integer');
            if (!glue || glue.value < 0) {
              this.invalid = true;
              return [this];
            }
            if (!data.registers.skip[glue.value]) {
              data.registers.skip[glue.value] = new GlueReg(new DimenReg(0, 0), new DimenReg(0, 0), new DimenReg(0, 0));
              for (var i = 0, l = e.scopes.length; i < l; i++) {
                e.scopes[i].registers.skip[glue.value] = new GlueReg((i ? e.scopes[i - 1] : data).registers.skip[glue.value]);
              }
            }
            return [e.scopes.last().registers.skip[glue.value]];
          }),
          skipdef: new Primitive('skipdef', function(e) {
            // Glue version of \countdef.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var skipDefSym = Symbol();
            e.mouth.saveState(skipDefSym);
            var name = e.mouth.eat();
  
            if (name.type == 'command') {
              if (name.name in data.defs.primitive || name.name in data.parameters) {
                this.invalid = true;
                e.mouth.loadState(skipDefSym);
                return [true];
              }
              var optEquals = e.mouth.eat();
              if (!optEquals || optEquals.type != 'character' || optEquals.char != '=' || optEquals.cat != catcodes.OTHER) optEquals && e.mouth.revert();
              var integer = e.mouth.eat('integer');
              if (!integer || integer.value < 0) {
                this.invalid = true;
                e.mouth.loadState(skipDefSym);
                return [true];
              }
              name = name.name;
              integer = integer.value;
              if (!data.registers.skip[integer]) {
                data.registers.skip[integer] = new GlueReg(new DimenReg(0, 0), new DimenReg(0, 0), new DimenReg(0, 0));
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].registers.skip[integer] = new GlueReg((i ? e.scopes[i - 1] : data).registers.skip[integer]);
                }
              }
              if (e.toggles.global && e.scopes.last().registers.named.globaldefs.value >= 0 || e.scopes.last().registers.named.globaldefs.value > 0) {
                data.registers.named[name] = data.registers.skip[integer];
                delete data.defs.macros[name];
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].registers.named[name] = e.scopes[i].registers.skip[integer];
                  delete e.scopes[i].defs.macros[name];
                }
              } else {
                e.scopes.last().registers.named[name] = e.scopes.last().registers.skip[integer];
                delete e.scopes.last().defs.macros[name];
              }
            } else {
              this.invalid = true;
              e.mouth.loadState(countDefSym);
              return [true];
            }
          }),
          sl: new Primitive('sl', function(e) {
            // \sl makes all the characters in the rest of the scope oblique and unbolded.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'font modifier',
              value: 'sl'
            });
            return [];
          }),
          span: new Primitive('span', function(e) {
            // \span is used in \halign. If it's found in the preamble, it'll be handled in the
            // \halign function. If it's found in the table's body, it'll be handled here. If
            // it's not even found in a \halign in the first place, it's invalid. If a \span is
            // found in the table's body inside a cell, it acts like a regular alignment token.
            // The only difference is that the two cells on either side of it are joined into
            // one. Everything that happens for an alignment token also happens for this, ex-
            // cept the creation of a new cell. Most of the code below was copied from where
            // regular alignment tokens are parsed.
  
            if (e.contexts.last == 'mathchoice') e.contexts.last.failed();
  
            var cellScope = false;
            for (var i = e.scopes.length - 1; i >= 0; i--) {
              if (e.scopes[i].isHalignCell) {
                cellScope = e.scopes[i];
                break;
              }
            }
            if (!cellScope) {
              this.invalid = true;
              return [this];
            }
            var halignScope = cellScope.parentScope,
              row = halignScope.cellData[halignScope.cellData.length - 1];
            if (row[row.length - 1].omit) this.postPreamble = true;
            if (this.postPreamble && !e.scopes.last().isHalignCell || e.contexts.last != 'scope') {
              this.invalid = true;
              return [this];
            }
  
            if (!this.postPreamble) {
              var column = -1,
                tokens;
              for (var i = 0, l = row.length; i < l; i++) {
                column += row[i].span;
              }
              if (halignScope.preamble[column]) {
                tokens = halignScope.preamble[column][1];
              } else if (~halignScope.repeatPreambleAt) {
                var repeatable = halignScope.preamble.slice(halignScope.repeatPreambleAt, halignScope.preamble.length);
                tokens = repeatable[(column - halignScope.repeatPreambleAt) % repeatable.length][1];
              } else {
                this.invalid = true;
                return [this];
              }
              if (!halignScope.preamble[++column] && !~halignScope.repeatPreambleAt) {
                this.invalid = true;
                return [this];
              }
              var preambleToks = [];
              for (var i = 0, l = tokens.length; i < l; i++) {
                var token = {};
                for (var key in tokens[i]) {
                  token[key] = tokens[i][key];
                }
                preambleToks.push(token);
              }
              this.postPreamble = true;
              return preambleToks.concat(this);
            }
  
            if (e.scopes.last().root) e.scopes.last().root.invalid = true;
  
            e.contexts.pop();
            var tokens = e.scopes.last().tokens;
            if (e.scopes.last().isFrac) {
              row[row.length - 1].content.push({
                type: 'atom',
                atomType: 'inner',
                nucleus: [{
                  type: 'fraction',
                  numerator: e.scopes.last().fracNumerator,
                  denominator: tokens,
                  barWidth: e.scopes.last().barWidth,
                  delims: [e.scopes.last().fracLeftDelim, e.scopes.last().fracRightDelim],
                  nullDelimiterSpace: new DimenReg(e.scopes.last().registers.named.nulldelimiterspace)
                }],
                superscript: null,
                subscript: null
              });
              e.scopes.pop();
            } else {
              e.scopes.pop();
              row[row.length - 1].content = row[row.length - 1].content.concat(tokens);
            }
  
            var spanOmitSym = Symbol();
            e.mouth.saveState(spanOmitSym);
  
            row[row.length - 1].omit = false;
            row[row.length - 1].span++;
  
            // Even though this is the same cell as the one that was just "closed", each sec-
            // tion of the cell has its own omit value. If the new part of the cell doesn't
            // have its own \omit, its omit value is assumed to be false, even if the old, con-
            // nected cell has its omit value set to true.
            while (true) {
              var token = e.mouth.eat();
  
              if (!token) {
                e.mouth.loadState(spanOmitSym);
                break;
              } else if (token.type == 'character' && token.cat != catcodes.ACTIVE) {
                e.mouth.loadState(spanOmitSym);
                break;
              } else if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
                if (token.name in e.scopes.last().registers.named) {
                  e.mouth.loadState(spanOmitSym);
                  break;
                }
  
                var macro = token.type == 'command' ? e.scopes.last().defs.primitive[token.name] || e.scopes.last().defs.macros[token.name] : e.scopes.last().defs.active[token.char];
  
                if (!macro) {
                  e.mouth.loadState(spanOmitSym);
                  break;
                }
                if ((macro === data.defs.primitive.the          || macro.proxy && macro.original === data.defs.primitive.the)          ||
                  (macro === data.defs.primitive.expandafter  || macro.proxy && macro.original === data.defs.primitive.expandafter)  ||
                  (macro === data.defs.primitive.number       || macro.proxy && macro.original === data.defs.primitive.number)       ||
                  (macro === data.defs.primitive.romannumeral || macro.proxy && macro.original === data.defs.primitive.romannumeral) ||
                  (macro === data.defs.primitive.csname       || macro.proxy && macro.original === data.defs.primitive.csname)       ||
                  (macro === data.defs.primitive.string       || macro.proxy && macro.original === data.defs.primitive.string)       ||
                  (macro === data.defs.primitive.if           || macro.isLet && macro.original === data.defs.primitive.if)           ||
                  (macro === data.defs.primitive.ifcase       || macro.isLet && macro.original === data.defs.primitive.ifcase)       ||
                  (macro === data.defs.primitive.ifcat        || macro.isLet && macro.original === data.defs.primitive.ifcat)        ||
                  (macro === data.defs.primitive.ifdim        || macro.isLet && macro.original === data.defs.primitive.ifdim)        ||
                  (macro === data.defs.primitive.ifeof        || macro.isLet && macro.original === data.defs.primitive.ifeof)        ||
                  (macro === data.defs.primitive.iffalse      || macro.isLet && macro.original === data.defs.primitive.iffalse)      ||
                  (macro === data.defs.primitive.ifodd        || macro.isLet && macro.original === data.defs.primitive.ifodd)        ||
                  (macro === data.defs.primitive.ifnum        || macro.isLet && macro.original === data.defs.primitive.ifnum)        ||
                  (macro === data.defs.primitive.ifhmode      || macro.isLet && macro.original === data.defs.primitive.ifhmode)      ||
                  (macro === data.defs.primitive.ifinner      || macro.isLet && macro.original === data.defs.primitive.ifinner)      ||
                  (macro === data.defs.primitive.ifmmode      || macro.isLet && macro.original === data.defs.primitive.ifmmode)      ||
                  (macro === data.defs.primitive.iftrue       || macro.isLet && macro.original === data.defs.primitive.iftrue)       ||
                  (macro === data.defs.primitive.ifvmode      || macro.isLet && macro.original === data.defs.primitive.ifvmode)      ||
                  (macro === data.defs.primitive.ifvoid       || macro.isLet && macro.original === data.defs.primitive.ifvoid)       ||
                  (macro === data.defs.primitive.ifx          || macro.isLet && macro.original === data.defs.primitive.ifx)) {
                  var expansion = e.mouth.expand(token, e.mouth);
                  if (expansion.length == 1 && expansion[0] === token && token.invalid) {
                    e.mouth.loadState(spanOmitSym);
                    break;
                  }
                  e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
                  continue;
                } else if (macro === data.defs.primitive.omit || macro.proxy && macro.original === data.defs.primitive.omit) {
                  row[row.length - 1].omit = true;
                  break;
                }
  
                if (macro.type == 'primitive' || macro.proxy && macro.original.type == 'primitive') {
                  e.mouth.loadState(spanOmitSym);
                  break;
                }
  
                var expansion = e.mouth.expand(token, e.mouth);
                if (expansion.length == 1 && expansion[0] ==- token && token.invalid) {
                  e.mouth.loadState(spanOmitSym);
                  break;
                }
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              }
            }
  
            e.contexts.push({
              toString: () => 'scope',
              type: "scope"
            });
            new e.Scope();
            e.scopes.last().isHalignCell = true;
  
            if (!row[row.length - 1].omit) {
              var column = -1;
              for (var i = 0, l = row.length; i < l; i++) {
                column += row[i].span;
              }
              if (halignScope.preamble[column]) {
                tokens = halignScope.preamble[column][0];
              } else if (~halignScope.repeatPreambleAt) {
                var repeatable = halignScope.preamble.slice(halignScope.repeatPreambleAt, halignScope.preamble.length);
                tokens = repeatable[(column - halignScope.repeatPreambleAt) % repeatable.length][0];
              }
  
              var preambleToks = [];
              for (var i = 0, l = tokens.length; i < l; i++) {
                var token = {};
                for (var key in tokens[i]) {
                  token[key] = tokens[i][key];
                }
                preambleToks.push(token);
              }
              return preambleToks;
            }
          }),
          radical: new Primitive('radical', function(e) {
            // Normally, \radical accepts a numerical argument to dictate which character to
            // display as the radical. This version though only accepts the normal radical sym-
            // bol (U+221A), which doesn't really take away any functionality since why else
            // would you EVER use \radical without the actual radical symbol? It just simplif-
            // ies a task that would take forever to implement.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'family modifier',
              value: 'rad',
              index: [],
              token: this
            });
            return [];
          }),
          root: new Primitive('root', function(e) {
            // \root is normally an extension of \radical that displays a small exponent above
            // the radical sign. It's another version of LaTeX's \sqrt command. In TeX, it's
            // implemented as a macro that makes heavy use of boxes. Since boxes aren't really
            // here in this version, there's no real way of doing it other than as a primitive.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            // If another \root is already open, but hasn't been closed by a \of yet, the cur-
            // rent \root is invalid. Consider the following syntax: \root1\root2\of3\of4. The
            // second \root is invalid because the first \root will be closed by the first \of,
            // since TeX wouldn't consider nesting while scanning for a macro. Then, the second
            // \root wouldn't have a closing \of, so it would be marked as invalid.
            if (e.scopes.last().root) {
              this.invalid = true;
              return [this];
            }
  
            this.ignore = true;
            e.scopes.last().root = this;
            return [this];
          }),
          string: new Primitive('string', function(e) {
            // \string returns a list of catcode 12 tokens that represent the next token. If
            // the next token is a character, then the character is returned by itself with
            // its catcode set to 12. If it's a command, then multiple character tokens are
            // returned that spell out the command name.
  
            var token = e.mouth.eat();
            if (!token) {
              this.invalid = true;
              return [this];
            }
  
            if (token.type == 'character') {
              return [{
                type: 'character',
                cat: catcodes.OTHER,
                char: token.char,
                code: token.code
              }];
            } else if (token.type == 'command') {
              return (String.fromCharCode(e.scopes.last().registers.named.escapechar.value) + token.name).split('').map(function(char) {
                return {
                  type: 'character',
                  cat: catcodes.OTHER,
                  char: char,
                  code: char.charCodeAt(0)
                };
              });
            } else {
              this.invalid = true;
              e.mouth.revert();
              return [this];
            }
          }),
          textstyle: new Primitive('textstyle', function(e) {
            // \textstyle makes all the characters in the rest of the scope appear as an inline
            // equation.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'font modifier',
              value: 'textstyle'
            });
            return [];
          }),
          the: new Primitive('the', function(e) {
            // The \the command creates a list of tokens from a register. Integer registers
            // return just plain numbers. Dimensions return a decimal number followed by "pt".
            // Glues return a dimension along with "plus x minus y" if the glue has nonzero
            // stretch (x) and shrink (y) values.
  
            var theSym = Symbol()
            e.mouth.saveState(theSym);
  
            while (true) {
              var token = e.mouth.eat();
  
              if (token && (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE)) {
                var expansion = e.mouth.expand(token, e.mouth);
  
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
              } else if (token && token.register) {
                if (token.type == 'integer') {
                  return token.value.toString().split('').map(function(element) {
                    return {
                      type: 'character',
                      cat: catcodes.OTHER,
                      char: element,
                      code: element.charCodeAt(0)
                    };
                  });
                } else if (token.type == 'dimension') {
                  var pts = Math.round(token.sp.value / 65536 * 100000) / 100000;
                  pts += (Math.round(token.em.value / 65536 * 100000) / 100000) * 12;
                  return (pts + (Number.isInteger(pts) ? '.0pt' : 'pt')).split('').map(function(element) {
                    return {
                      type: 'character',
                      cat: catcodes.OTHER,
                      char: element,
                      code: element.charCodeAt(0)
                    };
                  });
                } else if (token.type == 'mu dimension') {
                  var mus = Math.round(token.mu.value / 65536 * 100000) / 100000;
                  return (mus + (Number.isInteger(mus) ? '.0mu' : 'mu')).split('').map(function(element) {
                    return {
                      type: 'character',
                      cat: catcodes.OTHER,
                      char: element,
                      code: element.charCodeAt(0)
                    };
                  });
                } else if (token.type == 'glue') {
                  var string = '',
                    pts = Math.round(token.start.sp.value / 65536 * 100000) / 100000;
                    pts += (Math.round(token.start.em.value / 65536 * 100000) / 100000) * 12;
                  string = pts + (Number.isInteger(pts) ? '.0pt' : 'pt');
                  if (token.stretch instanceof DimenReg && (token.stretch.sp.value || token.stretch.em.value)) {
                    pts = Math.round(token.stretch.sp.value / 65536 * 100000) / 100000;
                    pts += (Math.round(token.stretch.em.value / 65536 * 100000) / 100000) * 12;
                    string += ' plus ' + pts + (Number.isInteger(pts) ? '.0pt' : 'pt');
                  } else if (token.stretch instanceof InfDimen && token.stretch.number.value) {
                    var fils = Math.round(token.stretch.number.value / 65536 * 100000) / 100000;
                    string += ' plus ' + fils + (Number.isInteger(fils) ? '.0' : '') + 'fil' + new Array(token.stretch.magnitude.value).join('l');
                  }
                  if (token.shrink instanceof DimenReg && (token.shrink.sp.value || token.shrink.em.value)) {
                    pts = Math.round(token.shrink.sp.value / 65536 * 100000) / 100000;
                    pts += (Math.round(token.shrink.em.value / 65536 * 100000) / 100000) * 12;
                    string += ' minus ' + pts + (Number.isInteger(pts) ? '.0pt' : 'pt');
                  } else if (token.shrink instanceof InfDimen && token.shrink.number.value) {
                    var fils = Math.round(token.shrink.number.value / 65536 * 100000) / 100000;
                    string += ' minus ' + fils + (Number.isInteger(fils) ? '.0' : '') + 'fil' + new Array(token.shrink.magnitude.value).join('l');
                  }
                  return string.split('').map(function(element) {
                    return {
                      type: 'character',
                      cat: catcodes.OTHER,
                      char: element,
                      code: element.charCodeAt(0)
                    };
                  });
                } else if (token.type == 'mu glue') {
                  var string = '',
                    mus = Math.round(token.start.mu.value / 65536 * 100000) / 100000;
                  string = mus + (Number.isInteger(mus) ? '.0mu' : 'mu');
                  if (token.stretch instanceof MuDimenReg && token.stretch.mu.value) {
                    mus = Math.round(token.stretch.mu.value / 65536 * 100000) / 100000;
                    string += ' plus ' + mus + (Number.isInteger(mus) ? '.0mu' : 'mu');
                  } else if (token.stretch instanceof InfDimen && token.stretch.number.value) {
                    var fils = Math.round(token.stretch.number.value / 65536 * 100000) / 100000;
                    string += ' plus ' + fils + (Number.isInteger(fils) ? '.0' : '') + 'fil' + new Array(token.stretch.magnitude.value).join('l');
                  }
                  if (token.shrink instanceof MuDimenReg && token.shrink.mu.value) {
                    mus = Math.round(token.shrink.mu.value / 65536 * 100000) / 100000;
                    string += ' minus ' + mus + (Number.isInteger(mus) ? '.0mu' : 'mu');
                  } else if (token.shrink instanceof InfDimen && token.shrink.number.value) {
                    var fils = Math.round(token.shrink.number.value / 65536 * 100000) / 100000;
                    string += ' minus ' + fils + (Number.isInteger(fils) ? '.0' : '') + 'fil' + new Array(token.shrink.magnitude.value).join('l');
                  }
                  return string.split('').map(function(element) {
                    return {
                      type: 'character',
                      cat: catcodes.OTHER,
                      char: element,
                      code: element.charCodeAt(0)
                    };
                  });
                }
              } else {
                this.invalid = true;
                e.mouth.loadState(theSym);
                return [this];
              }
            }
          }),
          time: new Primitive('time', function(e) {
            // Returns the current time of the day as minutes since midnight.
  
            var date = new Date();
            return [new IntegerReg(date.getHours() * 60 + date.getMinutes())];
          }),
          uccode: new Primitive('uccode', function(e) {
            // Uppercase version of \lccode.
  
            let integer = e.mouth.eat("integer");
  
            if (integer && integer.value > 0) {
              return [e.scopes.last().uc[integer.value] = e.scopes.last().uc[integer.value] || new IntegerReg(0)];
            } else {
              this.invalid = true;
              return [this];
            }
          }),
          underline: new Primitive('underline', function(e) {
            // Underline version of \overline.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'family modifier',
              value: 'under',
              token: this
            });
            return [];
          }),
          uppercase: new Primitive('uppercase', function(e) {
            // \uppercase is analogous to \lowercase. It converts character to their uppercase
            // values.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var ucSym = Symbol();
            e.mouth.saveState(ucSym);
  
            var open = e.mouth.eat();
            if (!open || open.cat != catcodes.OPEN) {
              this.invalid = true;
              e.mouth.loadState(ucSym);
              return [this];
            }
  
            var tokens = [],
              groups = 1;
            while (true) {
              var token = e.mouth.eat('pre space');
  
              if (!token) {
                this.invalid = true;
                e.mouth.loadState(ucSym);
                return [this];
              } else if (token.type == 'character' && token.cat == catcodes.OPEN) {
                groups++;
                tokens.push(token);
              } else if (token.type == 'character' && token.cat == catcodes.CLOSE) {
                groups--;
                if (groups > 0) tokens.push(token);
                else break;
              } else tokens.push(token);
            }
  
            for (var i = 0, l = tokens.length; i < l; i++) {
              if (tokens[i].type == 'character' && e.scopes.last().uc[tokens[i].code] && e.scopes.last().uc[tokens[i].code].value > 0) {
                tokens[i].code = e.scopes.last().uc[tokens[i].code].value;
                tokens[i].char = String.fromCharCode(tokens[i].code);
              }
            }
            return tokens;
          }),
          vbox: new Primitive('vbox', function(e) {
            // \vbox is analogous to \hbox except the "to" or "spread" will affect its height
            // instead of its width. Look at \hbox for comments.
            var vboxSym = Symbol();
            e.mouth.saveState(vboxSym);
            var spread, to;
            while (true) {
              var token = e.mouth.eat();
              if (!token) {
                this.invalid = true;
                return [this];
              }
              if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
                var macro = token.type == 'command' ? e.scopes.last().defs.primitive[token.name] || e.scopes.last().defs.macros[token.name] : e.scopes.last().defs.active[token.char];
                if (macro && (macro === data.defs.primitive.relax || macro.proxy && macro.original === data.defs.primitive.relax)) break;
                var expansion = e.mouth.expand(token, e.mouth);
                e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
                continue;
              } else if (token.type == 'character' && (token.char == 't' || token.char == 'T')) {
                var o = e.mouth.eat('pre space');
                if (o && o.type == 'character' && (o.char == 'o' || token.char == 'O') && token.cat != catcodes.ACTIVE) {
                  var dimen = e.mouth.eat('dimension');
                  if (dimen) {
                    to = dimen;
                    break;
                  } else {
                    this.invalid = true;
                    e.mouth.loadState(vboxSym);
                    return [this];
                  }
                } else {
                  this.invalid = true;
                  e.mouth.loadState(vboxSym);
                  return [this];
                }
              } else if (token.type == 'character' && (token.char == 's' || token.char == 'S')) {
                var p = e.mouth.eat(),
                  r = e.mouth.eat(),
                  E = e.mouth.eat(),
                  a = e.mouth.eat(),
                  d = e.mouth.eat();
                if (!p || p.type != 'character' || p.char != 'p' && p.char != 'P' || p.cat == catcodes.ACTIVE ||
                  !r || r.type != 'character' || r.char != 'r' && r.char != 'R' || r.cat == catcodes.ACTIVE ||
                  !E || E.type != 'character' || E.char != 'e' && E.char != 'E' || E.cat == catcodes.ACTIVE ||
                  !a || a.type != 'character' || a.char != 'a' && a.char != 'A' || a.cat == catcodes.ACTIVE ||
                  !d || d.type != 'character' || d.char != 'd' && d.char != 'D' || d.cat == catcodes.ACTIVE) {
                  this.invalid = true;
                  e.mouth.loadState(vboxSym);
                  return [this];
                }
                var dimen = e.mouth.eat('dimension');
                if (dimen) {
                  spread = dimen;
                  break;
                } else {
                  this.invalid = true;
                  e.mouth.loadState(vboxSym);
                  return [this];
                }
              } else if (token.type == 'character' && token.cat == catcodes.OPEN) {
                e.mouth.revert();
                break;
              } else {
                this.invalid = true;
                e.mouth.loadState(vboxSym);
                return [this];
              }
            }
            var open = e.mouth.preview();
            if (!open || open.type != 'character' || open.cat != catcodes.OPEN) {
              this.invalid = true;
              e.mouth.loadState(vboxSym);
              return [this];
            }
            if (!to && !spread) spread = new DimenReg(0, 0);
            e.tokens.push({
              type: 'box wrapper',
              value: 'vertical',
              to: to,
              spread: spread,
              token: this
            });
            return [];
          }),
          vcenter: new Primitive('vcenter', function(e) {
            // \vcenter creates a Vcent atom using the atom immediately following the \vcenter.
            // A Vcent atom will be rendered exactly like an Ord atom, except that it will be
            // centered vertically on the line when rendered.
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            // A temporary atom is added to the token list, similar to how \accent works.
            e.tokens.push({
              type: 'family modifier',
              value: 'vcent',
              token: this
            });
            return [];
          }),
          vfil: new Primitive('vfil', function(e) {
            // \vfil makes a vertical glue that is analogous to \hfil.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'vglue',
              glue: new GlueReg(new DimenReg(0), new InfDimen(1, 1), new DimenReg(0))
            });
            return [];
          }),
          vfill: new Primitive('vfill', function(e) {
            // Vertical glue version of \hfill.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            e.tokens.push({
              type: 'vglue',
              glue: new GlueReg(new DimenReg(0), new InfDimen(1, 2), new DimenReg(0))
            });
            return [];
          }),
          vrule: new Primitive('vrule', function(e) {
            // \vrule works like \hrule except it stretched to 100% vertically instead of hor-
            // izontally.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var hruleSym = Symbol();
            e.mouth.saveState(hruleSym);
  
            var height = false,
              depth = false,
              width = false;
  
            while (true) {
              var token = e.mouth.eat();
  
              if (!token) {
                e.mouth.revert();
                break;
              }
  
              if ((token.char == 'h' || token.char == 'H') && token.cat != catcodes.ACTIVE) {
                // If there is an "h", "eight" plus a dimension should follow. If that isn't what
                // follows, everything after the "h" is ignored.
                token = e.mouth.eat('pre space');
                if (token && (token.char == 'e' || token.char == 'E') && token.cat != catcodes.ACTIVE) {
                  token = e.mouth.eat('pre space');
                  if (token && (token.char == 'i' || token.char == 'I') && token.cat != catcodes.ACTIVE) {
                    token = e.mouth.eat('pre space');
                    if (token && (token.char == 'g' || token.char == 'G') && token.cat != catcodes.ACTIVE) {
                      token = e.mouth.eat('pre space');
                      if (token && (token.char == 'h' || token.char == 'H') && token.cat != catcodes.ACTIVE) {
                        token = e.mouth.eat('pre space');
                        if (token && (token.char == 't' || token.char == 'T') && token.cat != catcodes.ACTIVE) {
                          token = e.mouth.eat('dimension');
                          if (token) {
                            height = token;
                            continue;
                          } else e.mouth.revert(6);
                        } else e.mouth.revert(token ? 6 : 5);
                      } else e.mouth.revert(token ? 5 : 4);
                    } else e.mouth.revert(token ? 4 : 3);
                  } else e.mouth.revert(token ? 3 : 2);
                } else e.mouth.revert(token ? 2 : 1);
                break;
              } else if ((token.char == 'd' || token.char == 'D') && token.cat != catcodes.ACTIVE) {
                // This does the same thing as above for "depth".
                token = e.mouth.eat('pre space');
                if (token && (token.char == 'e' || token.char == 'E') && token.cat != catcodes.ACTIVE) {
                  token = e.mouth.eat('pre space');
                  if (token && (token.char == 'p' || token.char == 'P') && token.cat != catcodes.ACTIVE) {
                    token = e.mouth.eat('pre space');
                    if (token && (token.char == 't' || token.char == 'T') && token.cat != catcodes.ACTIVE) {
                      token = e.mouth.eat('pre space');
                      if (token && (token.char == 'h' || token.char == 'H') && token.cat != catcodes.ACTIVE) {
                        token = e.mouth.eat('dimension');
                        if (token) {
                          depth = token;
                          continue;
                        } else e.mouth.revert(5);
                      } else e.mouth.revert(token ? 5 : 4);
                    } else e.mouth.revert(token ? 4 : 3);
                  } else e.mouth.revert(token ? 3 : 2);
                } else e.mouth.revert(token ? 2 : 1);
                break;
              } else if ((token.char == 'w' || token.char == 'W') && token.cat != catcodes.ACTIVE) {
                // This does the same thing as above for "width".
                token = e.mouth.eat('pre space');
                if (token && (token.char == 'i' || token.char == 'I') && token.cat != catcodes.ACTIVE) {
                  token = e.mouth.eat('pre space');
                  if (token && (token.char == 'd' || token.char == 'D') && token.cat != catcodes.ACTIVE) {
                    token = e.mouth.eat('pre space');
                    if (token && (token.char == 't' || token.char == 'T') && token.cat != catcodes.ACTIVE) {
                      token = e.mouth.eat('pre space');
                      if (token && (token.char == 'h' || token.char == 'H') && token.cat != catcodes.ACTIVE) {
                        token = e.mouth.eat('dimension');
                        if (token) {
                          width = token;
                          continue;
                        } else e.mouth.revert(5);
                      } else e.mouth.revert(token ? 5 : 4);
                    } else e.mouth.revert(token ? 4 : 3);
                  } else e.mouth.revert(token ? 3 : 2);
                } else e.mouth.revert(token ? 2 : 1);
                break;
              } else {
                e.mouth.revert();
                break;
              }
            }
  
            width = width || new DimenReg(0, 65536 / 30);
  
            e.tokens.push({
              type: 'rule',
              ruleType: 'v',
              height: height,
              depth: depth,
              width: width
            });
            return [];
          }),
          vskip: new Primitive('vskip', function(e) {
            // Verical version of \hskip.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
  
            var glue = e.mouth.eat('glue');
            if (!glue) {
              this.invalid = true;
              return [this];
            }
            e.tokens.push({
              type: 'vglue',
              glue: glue
            });
            return [];
          }),
          xdef: new Primitive('xdef', function(e) {
            // \xdef is like a combination of \gdef and \edef. All the code below was copied
            // from \edef, so look there for comments and stuff.
  
            if (e.contexts.last == 'superscript' || e.contexts.last == 'subscript') {
              this.invalid = true;
              return [this];
            }
            var defSym = Symbol();
            e.mouth.saveState(defSym);
            var name = e.mouth.eat();
            if (!name) {
              this.invalid = true;
              return [this];
            }
            var type;
            if (name.type == 'character') {
              if (e.catOf(name.char) == catcodes.ACTIVE) {
                type = 'active';
                name = name.char;
              } else {
                this.invalid = true;
                e.mouth.loadState(defSym);
                return [this];
              }
            } else if (name.type == 'command') {
              type = 'macro';
              name = name.name;
              if (name in e.scopes.last().defs.primitive || name in data.parameters) {
                this.invalid = true;
                e.mouth.loadState(defSym);
                return [this];
              }
            }
            var params = [],
              used = 0,
              endInOpen = false;
            while (true) {
              var token = e.mouth.eat();
              if (!token) {
                this.invalid = true;
                e.mouth.loadState(defSym);
                return [this];
              } else if (token.cat == catcodes.OPEN) {
                e.mouth.revert();
                break;
              } else if (token.cat == catcodes.PARAMETER) {
                var paramTok = e.mouth.eat('pre space');
                if (!paramTok) {
                  this.invalid = true;
                  e.mouth.loadState(defSym);
                  return [this];
                } else if (paramTok.cat == catcodes.OPEN) {
                  endInOpen = true;
                  e.mouth.revert();
                  params.push({
                    type: 'character',
                    cat: catcodes.OPEN,
                    char: paramTok.char,
                    code: paramTok.code
                  })
                } else if (48 < paramTok.code && paramTok.code < 58 && paramTok.cat == catcodes.OTHER && +paramTok.char == used + 1) {
                  params.push(token);
                  used++;
                } else {
                  this.invalid = true;
                  e.mouth.loadState(defSym);
                  return [this];
                }
              } else params.push(token);
            }
            var openGroups = 0,
              replacement = [],
              noexpand = false,
              skip = false;
            while (true) {
              var token = e.mouth.eat();
              if (!token) {
                this.invalid = true;
                e.mouth.loadState(defSym);
                return [this];
              } else if (token.type == 'character' && token.cat == catcodes.PARAMETER && !skip) {
                var index = e.mouth.eat('pre space');
                if (index && (index.cat == catcodes.PARAMETER || (index.cat == catcodes.OTHER && index.char <= params.length && index.char >= 1))) {
                  e.mouth.revert();
                  if (index.cat == catcodes.PARAMETER) skip = true;
                } else {
                  this.invalid = true;
                  e.mouth.loadState(defSym);
                  return [this];
                }
                replacement.push(token);
                noexpand = false;
              } else if (token.type == 'character' && token.cat == catcodes.OPEN) {
                openGroups++;
                replacement.push(token);
                noexpand = false;
              } else if (token.type == 'character' && token.cat == catcodes.CLOSE) {
                openGroups--;
                if (openGroups == 0) break;
                replacement.push(token);
                noexpand = false;
              } else if (noexpand) {
                replacement.push(token);
                noexpand = false;
              } else if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
                if (token.name in e.scopes.last().registers.named) {
                  replacement.push(token);
                  continue;
                }
                var macro = token.type == 'command' ? e.scopes.last().defs.primitive[token.name] || e.scopes.last().defs.macros[token.name] : e.scopes.last().defs.active[token.char];
                if (!macro) {
                  this.invalid = true;
                  e.mouth.loadState(defSym);
                  return [this];
                }
                if ((macro === data.defs.primitive.the          || macro.proxy && macro.original === data.defs.primitive.the)          ||
                  (macro === data.defs.primitive.expandafter  || macro.proxy && macro.original === data.defs.primitive.expandafter)  ||
                  (macro === data.defs.primitive.number       || macro.proxy && macro.original === data.defs.primitive.number)       ||
                  (macro === data.defs.primitive.romannumeral || macro.proxy && macro.original === data.defs.primitive.romannumeral) ||
                  (macro === data.defs.primitive.csname       || macro.proxy && macro.original === data.defs.primitive.csname)       ||
                  (macro === data.defs.primitive.string       || macro.proxy && macro.original === data.defs.primitive.string)       ||
                  (macro === data.defs.primitive.if           || macro.isLet && macro.original === data.defs.primitive.if)           ||
                  (macro === data.defs.primitive.ifcase       || macro.isLet && macro.original === data.defs.primitive.ifcase)       ||
                  (macro === data.defs.primitive.ifcat        || macro.isLet && macro.original === data.defs.primitive.ifcat)        ||
                  (macro === data.defs.primitive.ifdim        || macro.isLet && macro.original === data.defs.primitive.ifdim)        ||
                  (macro === data.defs.primitive.ifeof        || macro.isLet && macro.original === data.defs.primitive.ifeof)        ||
                  (macro === data.defs.primitive.iffalse      || macro.isLet && macro.original === data.defs.primitive.iffalse)      ||
                  (macro === data.defs.primitive.ifodd        || macro.isLet && macro.original === data.defs.primitive.ifodd)        ||
                  (macro === data.defs.primitive.ifnum        || macro.isLet && macro.original === data.defs.primitive.ifnum)        ||
                  (macro === data.defs.primitive.ifhmode      || macro.isLet && macro.original === data.defs.primitive.ifhmode)      ||
                  (macro === data.defs.primitive.ifinner      || macro.isLet && macro.original === data.defs.primitive.ifinner)      ||
                  (macro === data.defs.primitive.ifmmode      || macro.isLet && macro.original === data.defs.primitive.ifmmode)      ||
                  (macro === data.defs.primitive.iftrue       || macro.isLet && macro.original === data.defs.primitive.iftrue)       ||
                  (macro === data.defs.primitive.ifvmode      || macro.isLet && macro.original === data.defs.primitive.ifvmode)      ||
                  (macro === data.defs.primitive.ifvoid       || macro.isLet && macro.original === data.defs.primitive.ifvoid)       ||
                  (macro === data.defs.primitive.ifx          || macro.isLet && macro.original === data.defs.primitive.ifx)) {
                  var expansion = e.mouth.expand(token, e.mouth);
                  if (expansion.length == 1 && expansion[0] === token && token.invalid) {
                    this.invalid = true;
                    e.mouth.loadState(defSym);
                    return [this];
                  }
                  e.mouth.queue.unshift.apply(e.mouth.queue, expansion);
                  continue;
                } else if (macro === data.defs.primitive.noexpand || macro.proxy && macro.original === data.defs.primitive.noexpand) {
                  noexpand = true;
                  continue;
                }
                if (macro instanceof Primitive || macro.proxy && macro.original instanceof Primitive) {
                  replacement.push(token);
                  continue;
                }
                e.mouth.queue.unshift.apply(e.mouth.queue, e.mouth.expand(token, e.mouth));
              } else replacement.push(token);
            }
  
            replacement.shift();
            if (endInOpen) replacement.push(params[params.length - 1]);
            var macro = new Macro(replacement, params);
            if (e.scopes.last().registers.named.globaldefs.value < 0) {
              e.scopes.last().defs[type == 'macro' ? 'macros' : 'active'][name] = macro;
              delete e.scopes.last().registers.named[name];
            } else {
              if (type == 'macro') {
                data.defs.macros[name] = macro;
                delete data.registers.named[name];
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].defs.macros[name] = macro;
                  delete e.scopes.last().registers.named[name];
                }
              } else {
                data.defs.active[name] = macro;
                delete data.registers.named[name];
                for (var i = 0, l = e.scopes.length; i < l; i++) {
                  e.scopes[i].defs.ative[name] = macro;
                  delete e.scopes.last().registers.named[name];
                }
              }
            }
            e.toggles.global = false;
            return [];
          }),
          year: new Primitive('year', function(e) {
            // Returns the current year.
  
            return [new IntegerReg(new Date().getFullYear())];
          }),
          "@debug": new Primitive('@debug', function(e) {
            // This primitive makes the browser stop at the debugger statement for the user to do
            // whatever debugging they might need to. It expands to nothing. If the browser's develop-
            // er tools aren't open, it'll just skip over the debugger statement and continue.
            debugger;
            return [];
          }),
          "js@function": new Primitive("js@function", function(e) {
            let javaScriptSym = Symbol();
            e.mouth.saveState(javaScriptSym);
  
            // First get the first token and make sure it starts a new group.
            let startingToken = e.mouth.eat();
            let groupType = null;
  
            if (startingToken) {
              if (expandable(startingToken)) {
                let macro = startingToken.type == "command" ?
                    e.lastScope.defs.primitive[startingToken.name] ||
                    e.lastScope.defs.macros[startingToken.name] :
                    e.lastScope.defs.active[startingToken.char];
  
                if (!macro) {
                  return fail(this);
                }
  
                if (macro.proxy) {
                  macro = macro.original;
                }
  
                if (macro == data.defs.primitive.begingroup) {
                  groupType = "semisimple";
                } else if (macro.replacement[0].type == "character" &&
                    macro.replacement[0].cat == catcodes.OPEN) {
                  groupType = "simple";
                }
              } else if (startingToken.type == "character" && startingToken.cat == catcodes.OPEN) {
                groupType = "simple";
              }
  
              if (!groupType) {
                e.mouth.loadState(javaScriptSym);
                return fail(this);
              }
            } else {
              e.mouth.loadState(javaScriptSym);
              return fail(this);
            }
  
            // Now the rest of the text is parsed. Each character in the text is looked at. To ensure
            // the JavaScript code is looked at correctly, groups are kept track of. Curly braces,
            // square brackets, parentheses, and all three types of quotes are kept track of to ensure
            // that a closing token does not get in the way of syntactically correct JavaScript.
            let groups = [];
            let string = e.mouth.string;
  
            let jsCode = string;
  
            while (string) {
              if (groups.length) {
                let lastGroup = groups[groups.length - 1];
                let inString = lastGroup == "\"" || lastGroup == "'" || lastGroup == "`";
                let inRaw = lastGroup == "raw";
  
                if (inRaw) {
                  if (string[0] == "`") {
                    groups.pop();
                  } else if (string.substring(0,2) == "${") {
                    groups.push("}");
                    string = string.substring(1);
                  }
                  string = string.substring(1);
                  continue;
                } else if (inString) {
                  if (string[0] == "\\") {
                    string = string.substring(1);
                  } else if (string[0] == lastGroup) {
                    groups.pop();
                  } else if (string.substring(0,2) == "${" && lastGroup == "`") {
                    groups.push("}");
                    string = string.substring(1);
                  }
                  string = string.substring(1);
                  continue;
                } else {
                  if (string.substring(0, 11) == "String.raw`") {
                    lastGroup.push("raw");
                    string = string.substring(11);
                    continue;
                  } else if (string[0] == "(") {
                    groups.push(")");
                    string = string.substring(1);
                    continue;
                  } else if (string[0] == "[") {
                    groups.push("]");
                    string = string.substring(1);
                    continue;
                  } else if (string[0] == "{") {
                    groups.push("}");
                    string = string.substring(1);
                    continue;
                  } else if (string[0] == "\"") {
                    groups.push("\"");
                    string = string.substring(1);
                    continue;
                  } else if (string[0] == "'") {
                    groups.push("'");
                    string = string.substring(1);
                    continue;
                  } else if (string[0] == "`") {
                    groups.push("`");
                    string = string.substring(1);
                    continue;
                  } else if (string[0] == lastGroup) {
                    groups.pop();
                  }
                  string = string.substring(1);
                  continue;
                }
              } else {
                if (string.substring(0, 11) == "String.raw`") {
                  groups.push("raw");
                  string = string.substring(11);
                  continue;
                } else if (string[0] == "(") {
                  groups.push(")");
                  string = string.substring(1);
                  continue;
                } else if (string[0] == "[") {
                  groups.push("]");
                  string = string.substring(1);
                  continue;
                } else if (string[0] == "{") {
                  groups.push("}");
                  string = string.substring(1);
                  continue;
                } else if (string[0] == "\"") {
                  groups.push("\"");
                  string = string.substring(1);
                  continue;
                } else if (string[0] == "'") {
                  groups.push("'");
                  string = string.substring(1);
                  continue;
                } else if (string[0] == "`") {
                  groups.push("`");
                  string = string.substring(1);
                  continue;
                }
  
                if (e.catOf(string[0]) == catcodes.CLOSE && groupType == "simple") {
                  jsCode = jsCode.substring(0, jsCode.length - string.length);
                  string = string.substring(1);
                  break;
                }
                string = string.substring(1);
                continue;
              }
            }
  
            e.mouth.history.push({
              queue: e.mouth.queue.slice(),
              string: e.mouth.string,
              history: e.mouth.history.slice()
            });
            e.mouth.string = string;
  
            let returnValue;
            try {
              returnValue = new Function(jsCode)();
            } catch (e) {
              return `${e.name}: ${e.message}`.split("").map(char => ({
                type: "character",
                char: char,
                code: char.codePointAt(0),
                cat: catcodes.OTHER,
                invalid: true,
                recognized: true
              }));
            }
            if (returnValue != undefined && returnValue != null) {
              let value = new String(returnValue).valueOf();
              e.mouth.string = value + e.mouth.string;
            }
  
            return [];
          })
        },
        macros: {
          // This is where user-defined macros are stored. They can be either plain macros that get
          // replaced with a list of tokens (defined using \def), or proxy macros that are references
          // to other macros (defined using \let). \let stores always stored a reference to an origin-
          // al macro. In other words, doing `\let\new=\old' stores the \old macro at \new. If \old
          // gets redefined later, a new macro is stored as its value, but that new macro doesn't af-
          // fect the old macro stored at \new. This object is initially empty because built-in macros
          // (like \sqrt, which is a macro built on top of \radical) are defined later on in this
          // script using `fontTeX.global`. The definitions are below, after the `data` object's def-
          // inition. This object also holds named registers (defined using \countdef, \dimendef,
          // etc.).
        },
        active: {
          // This is where active characters' definitions are stored. In plain TeX, only the tilde ~
          // character is an active character that evaluates to a no-break-space character. The tilde
          // character's definition is below where everything else is defined. Plain TeX also includes
          // an active character definition for apostrophes so that they will evaluate to "^{\prime}".
          // With TeX's built in fonts, that isn't a problem since the prime character is huge. When
          // it's shrunken into a superscript, it actually looks like an apostrophe. With normal fonts
          // though, the chance that the prime character is enlarged is pretty low. The chance that a
          // font even implements a prime character to begin with is even lower since it's such an un-
          // common character. If this version of TeX used a prime character too, apostrophes would
          // almost always looks out of place, especially since most fonts do have a perfectly good
          // apostrophe glyph since it's way more common. Thus, the apostrophe character is left alone
          // so that it can render as itself instead of as a prime character.
        }
      },
      registers: {
        // Plain TeX can normally only store 255 registers of each type. In this version though, up to
        // 65536 registers are allowed just because there's no real reason to limit the maximum regis-
        // ter count here. Count registers hold integer values. In TeX, integers are 32-bit, but Java-
        // Script allows for 64-bit integers, so the maximum value in this version is 9007199254740991
        // as opposed to 2147483647. Dimen registers hold dimension objects (which are basically just
        // integers with a sp (scaled points) unit attached). Skip registers hold glue objects (dimen-
        // sion objects with two additional dimensions). Mukip registers are like skip registers ex-
        // cept all three units are in terms of math units.
        count: {},
        dimen: {},
        skip: {},
        muskip: {},
        named: {
          // Named registers are those like \escapechar that hold special values. \escapechar for ex-
          // ample is an integer representing the character code of the default escape character
          // (starts off as the code point of '\').There are other non-integer registers as well, like
          // \thinmuskip (the space inserted when using `\,`). Some registers are used elsewhere in
          // the code here, but most are included just to stay consistent with real TeX.
  
          // Integer Registers
          pretolerance: new IntegerReg(100),
          tolerance: new IntegerReg(200),
          hbadness: new IntegerReg(1000),
          vbadness: new IntegerReg(1000),
          linepenalty: new IntegerReg(10),
          hypenpenalty: new IntegerReg(50),
          exhyphenpenalty: new IntegerReg(50),
          binoppenalty: new IntegerReg(700),
          relpenalty: new IntegerReg(500),
          clubpenalty: new IntegerReg(150),
          widowpenalty: new IntegerReg(150),
          displaywidowpenalty: new IntegerReg(50),
          brokenpenalty: new IntegerReg(100),
          predisplaypenalty: new IntegerReg(10000),
          postdisplaypenalty: new IntegerReg(0),
          floatingpenalty: new IntegerReg(0),
          interlinepenalty: new IntegerReg(0),
          outputpenalty: new IntegerReg(-10001),
          doublehyphendemerits: new IntegerReg(10000),
          finalhyphendemerits: new IntegerReg(5000),
          adjdemerits: new IntegerReg(10000),
          looseness: new IntegerReg(0),
          pausing: new IntegerReg(0),
          holdinginserts: new IntegerReg(0),
          tracingonline: new IntegerReg(0),
          tracingmacros: new IntegerReg(0),
          tracingstats: new IntegerReg(0),
          tracingparagraphs: new IntegerReg(0),
          tracingpages: new IntegerReg(0),
          tracingoutput: new IntegerReg(0),
          tracinglostchars: new IntegerReg(0),
          tracingcommands: new IntegerReg(0),
          tracingrestores: new IntegerReg(0),
          language: new IntegerReg(0),
          uchyph: new IntegerReg(1),
          lefthyphenmin: new IntegerReg(2),
          righthyphenmin: new IntegerReg(3),
          globaldefs: new IntegerReg(0),
          defaulthyphenchar: new IntegerReg(45),
          defaultskewchar: new IntegerReg(-1),
          escapechar: new IntegerReg(92),
          endlinechar: new IntegerReg(13),
          newlinechar: new IntegerReg(10),
          maxdeadcycles: new IntegerReg(100),
          hangafter: new IntegerReg(1),
          fam: new IntegerReg(0),
          mag: new IntegerReg(1000),
          delimiterfactor: new IntegerReg(901),
          showboxbreadth: new IntegerReg(-1),
          showboxdepth: new IntegerReg(-1),
          errorcontextlines: new IntegerReg(-1),
          // There are also \time, \day, \month, and \year registers. In normal TeX, since the entire
          // document is made in one go, there's only ever a need to set those registers once at the
          // beginning and leave them. With this version of TeX though, TeX can be rendered at differ-
          // ent times. That means those time registers have to always be up-to-date. Instead of hand-
          // ling them like normal registers then, they are treated like primitives. They return an
          // integer token according to their respective name.
  
          // Dimension Registers
          hfuzz: new DimenReg(65536 * 0.1, 0),
          vfuzz: new DimenReg(65536 * 0.1, 0),
          overfullrule: new DimenReg(0, 0),
          emergencystetch: new DimenReg(0, 0),
          hsize: new DimenReg(65536 * 345, 0),
          vsize: new DimenReg(65536 * 550, 0),
          maxdepth: new DimenReg(65536 * 5, 0),
          splitmaxdepth: new DimenReg(65536 * 16394, -65536),
          boxmaxdepth: new DimenReg(65536 * 16394, -65536),
          lineskiplimit: new DimenReg(0, 0),
          delimitershortfall: new DimenReg(65536 * 5, 0),
          nulldelimiterspace: new DimenReg(0, 65536 * .1),
          scriptspace: new DimenReg(65536 * 0.5, 0),
          mathsurround: new DimenReg(0, 0),
          predisplaystyle: new DimenReg(0, 0),
          displaywidth: new DimenReg(0, 0),
          displayindent: new DimenReg(0, 0),
          parindent: new DimenReg(65536 * 15, 0),
          hangindent: new DimenReg(0, 0),
          hoffset: new DimenReg(0, 0),
          voffset: new DimenReg(0, 0),
  
          // Glue Registers
          baselineskip: new GlueReg(new DimenReg(65536 * 12, 0)),
          lineskip: new GlueReg(new DimenReg(65536, 0)),
          parskip: new GlueReg(
            new DimenReg(0, 0),
            new DimenReg(65536, 0)
          ),
          abovedisplayskip: new GlueReg(
            new DimenReg(65536 * 10, 0),
            new DimenReg(65536 * 2, 0),
            new DimenReg(65536 * 5, 0)
          ),
          abovedisplayshortskip: new GlueReg(
            new DimenReg(0, 0),
            new DimenReg(65536 * 3, 0)
          ),
          belowdisplayskip: new GlueReg(
            new DimenReg(0, 0),
            new DimenReg(65536 * 3, 0)
          ),
          belowdisplayshortskip: new GlueReg(
            new DimenReg(65536 * 6, 0),
            new DimenReg(65536 * 3, 0),
            new DimenReg(65536 * 3, 0)
          ),
          leftskip: new GlueReg(new DimenReg(0, 0)),
          rightskip: new GlueReg(new DimenReg(0, 0)),
          topskip: new GlueReg(new DimenReg(65536 * 10, 0)),
          splittopskip: new GlueReg(new DimenReg(65536 * 10, 0)),
          tabskip: new GlueReg(new DimenReg(0, 0)),
          spaceskip: new GlueReg(new DimenReg(0, 0)),
          xspaceskip: new GlueReg(new DimenReg(0, 0)),
          parfillskip: new GlueReg(
            new DimenReg(0, 0),
            new InfDimen(65536, 1)
          ),
          
          // MuGlue Registers
          thinmuskip: new MuGlueReg(new MuDimenReg(65536 * 3)),
          medmuskip: new MuGlueReg(new MuDimenReg(65536 * 4), new MuDimenReg(65536 * 2), new MuDimenReg(65536 * 4)),
          thickmuskip: new MuGlueReg(new MuDimenReg(65536 * 5), new MuDimenReg(65536 * 5))
        }
      },
      // Catcodes determine what type of behavior a character will exhibit. A catcode of 1 for example
      // means the character is an opening token (TeX's default is {). 2 is a closing token. 3 - math
      // shift ($), 4 - alignment (&), 5 - EOL (\n), 6 - parameter (#), 7 - superscript (^), 8 - sub-
      // script (_), 9 - ignored (NULL), 10 - whitespace (SPACE and TAB), 11 - letters (a-z and A-Z),
      // 12 - other (anything that doesn't fall into another catcode), 13 - active (~), 14 - comment
      // (%), 15 - invalid (DELETE).
      cats: (function() {
        let cats = {
          0x5C: new IntegerReg(catcodes.ESCAPE,      0, 15),  // \
          0x7B: new IntegerReg(catcodes.OPEN,        0, 15),  // {
          0x7D: new IntegerReg(catcodes.CLOSE,       0, 15),  // }
          0x24: new IntegerReg(catcodes.MATHSHIFT,   0, 15),  // $
          0x26: new IntegerReg(catcodes.ALIGN,       0, 15),  // &
          0x0A: new IntegerReg(catcodes.ENDOFLINE,   0, 15),  // \n (U+000A)
          0x23: new IntegerReg(catcodes.PARAMETER,   0, 15),  // #
          0x5E: new IntegerReg(catcodes.SUPERSCRIPT, 0, 15),  // ^
          0x5F: new IntegerReg(catcodes.SUBSCRIPT,   0, 15),  // _
          0x00: new IntegerReg(catcodes.IGNORE,      0, 15),  // Null (U+0000)
          0x09: new IntegerReg(catcodes.WHITESPACE,  0, 15),  // Tab (U+0009)
          0x20: new IntegerReg(catcodes.WHITESPACE,  0, 15),  // Space (U+0020)
          0x7E: new IntegerReg(catcodes.ACTIVE,      0, 15),  // ~
          0x25: new IntegerReg(catcodes.COMMENT,     0, 15),  // %
          0x7F: new IntegerReg(catcodes.INVALID,     0, 15),  // Delete (U+007F)
        };
  
        // Make all lowercase letters have a catcode of LETTER.
        for (let codePoint = "a".codePointAt(0), z = "z".codePointAt(0); codePoint <= z; codePoint++) {
          cats[codePoint] = new IntegerReg(catcodes.LETTER, 0, 15);
        }
        // Same for uppercase.
        for (let codePoint = "A".codePointAt(0), z = "Z".codePointAt(0); codePoint <= z; codePoint++) {
          cats[codePoint] = new IntegerReg(catcodes.LETTER, 0, 15);
        }
        return cats;
      })(),
      // Math codes define what "family" a character falls into. It is used to determine spacing be-
      // tween characters. For example, a "+" is a Bin(ary) operator and has extra spacing around it
      // to make "1+1" appear not as crunched together. The Variable family is treated exactly like
      // the Ord family except they are rendered in italics. Other than that, they are basically syn-
      // onymous with Ord.
      mathcodes: (function() {
        let mathcodes = {};
  
        let op = "";
        for (let i = 0, l = op.length; i < l; i++) {
          mathcodes[op.codePointAt(i)] = new IntegerReg(atomTypes.OP, 0, 8);
        }
  
        let bin = '+-*±∓∖×∗⋆⋄∘∙÷∩∪⊎⊓⊔◃▹≀◯△▽∨∧⊕⊖⊗⊘⊙†‡⨿';
        for (let i = 0, l = bin.length; i < l; i++) {
          mathcodes[bin.codePointAt(i)] = new IntegerReg(atomTypes.BIN, 0, 8);
        }
  
        let rel = "<>=:\"≤≺⪯≪⊂⊆⊏⊑∈⊢⌣⌢≥≻⪰≫⊃⊇⊐⊒∋⊣≡∼≃≍≈≅⋈∝⊨≐⊥≮≰⊀⊄⊈⋢≯≱⊁⊅⊉⋣≠≢≁≄≆≭";
        for (let i = 0, l = rel.length; i < l; i++) {
          mathcodes[rel.codePointAt(i)] = new IntegerReg(atomTypes.REL, 0, 8);
        }
  
        let open = '([{`';
        for (let i = 0, l = open.length; i < l; i++) {
          mathcodes[open.codePointAt(i)] = new IntegerReg(atomTypes.OPEN, 0, 8);
        }
        let close = "}])!?";
        for (let i = 0, l = close.length; i < l; i++) {
          mathcodes[close.codePointAt(i)] = new IntegerReg(atomTypes.CLOSE, 0, 8);
        }
  
        let punct = ",;";
        for (let i = 0, l = punct.length; i < l; i++) {
          mathcodes[punct.codePointAt(i)] = new IntegerReg(atomTypes.PUNCT, 0, 8);
        }
  
        let variable =
            "abcdefghħijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZαβγδϵεζηθϑικλμνξπϖρϱσςτυϕφχψω";
        for (let i = 0, l = variable.length; i < l; i++) {
          mathcodes[variable.codePointAt(i)] = new IntegerReg(atomTypes.VARIABLE, 0, 8);
        }
  
        return mathcodes;
      })(),
      delims: [
        // Lists the code points of each character allowed to be a delimiter (like after \left). If a
        // character is found in a delimiter context that doesn't have one of the code points listed
        // below, it is considered invalid.
        0x0028, // (
        0x0029, // )
        0x002E, // .
        0x003C, // <
        0x003E, // >
        0x002F, // /
        0x005B, // [
        0x005C, // \
        0x005D, // ]
        0x007B, // {
        0x007C, // |
        0x007D, // }
        0x2016, // ‖
        0x2191, // ↑
        0x2193, // ↓
        0x2195, // ↕
        0x21D1, // ⇑
        0x21D3, // ⇓
        0x21D5, // ⇕
        0x2225, // ∥
        0x2308, // ⌈
        0x2309, // ⌉
        0x230A, // ⌊
        0x230B, // ⌋
        0x23AA, // ⎪
        0x23B0, // ⎰
        0x23B1, // ⎱
        0x23D0, // ⏐
        0x27E8, // ⟨
        0x27E9, // ⟩
        0x27EE, // ⟮
        0x27EF, // ⟯
      ],
      // The `parameters` array contains strings of the names of all built-in parameters. Since they
      // are used in the code in this script, the user isn't able to redefine new macros of these
      // names. User-defined named registers can still be changed.
      parameters: [
        "pretolerance",
        "tolerance",
        "hbadness",
        "vbadness",
        "linepenalty",
        "hypenpenalty",
        "exhyphenpenalty",
        "binoppenalty",
        "relpenalty",
        "clubpenalty",
        "widowpenalty",
        "displaywidowpenalty",
        "brokenpenalty",
        "predisplaypenalty",
        "postdisplaypenalty",
        "floatingpenalty",
        "interlinepenalty",
        "outputpenalty",
        "doublehyphendemerits",
        "finalhyphendemerits",
        "adjdemerits",
        "looseness",
        "pausing",
        "holdinginserts",
        "tracingonline",
        "tracingmacros",
        "tracingstats",
        "tracingparagraphs",
        "tracingpages",
        "tracingoutput",
        "tracinglostchars",
        "tracingcommands",
        "tracingrestores",
        "language",
        "uchyph",
        "lefthyphenmin",
        "righthyphenmin",
        "globaldefs",
        "defaulthyphenchar",
        "defaultskewchar",
        "escapechar",
        "endlinechar",
        "newlinechar",
        "maxdeadcycles",
        "hangafter",
        "fam",
        "mag",
        "delimiterfactor",
        "showboxbreadth",
        "showboxdepth",
        "errorcontextlines",
        "hfuzz",
        "vfuzz",
        "overfullrule",
        "emergencystetch",
        "hsize",
        "vsize",
        "maxdepth",
        "splitmaxdepth",
        "boxmaxdepth",
        "lineskiplimit",
        "delimitershortfall",
        "nulldelimiterfall",
        "scriptspace",
        "mathsurround",
        "predisplaystyle",
        "displaywidth",
        "displayindent",
        "parindent",
        "hangindent",
        "hoffset",
        "voffset",
        "baselineskip",
        "lineskip",
        "parskip",
        "abovedisplayskip",
        "abovedisplayshortskip",
        "belowdisplayskip",
        "belowdisplayshortskip",
        "leftskip",
        "rightskip",
        "topskip",
        "splittopskip",
        "tabskip",
        "spaceskip",
        "xspaceskip",
        "parfillskip",
        "thinmuskip",
        "medmuskip",
        "thickmuskip"
      ],
      lc: {
        // Each character in TeX has a \lccode value that defines the code point of the lowercase
        // version of that character. For example, the \lccode of "A" would be 0x0061 (97) because
        // that's the code point of the character "a". Most characters though have their \lccode set
        // to 0 since they don't have a lowercase character (e.g. "7" or "!").
        0x41: new IntegerReg(0x61),  // A -> a
        0x42: new IntegerReg(0x62),  // B -> b
        0x43: new IntegerReg(0x63),  // C -> c
        0x44: new IntegerReg(0x64),  // D -> d
        0x45: new IntegerReg(0x65),  // E -> e
        0x46: new IntegerReg(0x66),  // F -> f
        0x47: new IntegerReg(0x67),  // G -> g
        0x48: new IntegerReg(0x68),  // H -> h
        0x49: new IntegerReg(0x69),  // I -> i
        0x4A: new IntegerReg(0x6A),  // J -> j
        0x4B: new IntegerReg(0x6B),  // K -> k
        0x4C: new IntegerReg(0x6C),  // L -> l
        0x4D: new IntegerReg(0x6D),  // M -> m
        0x4E: new IntegerReg(0x6E),  // N -> n
        0x4F: new IntegerReg(0x6F),  // O -> o
        0x50: new IntegerReg(0x70),  // P -> p
        0x51: new IntegerReg(0x71),  // Q -> q
        0x52: new IntegerReg(0x72),  // R -> r
        0x53: new IntegerReg(0x73),  // S -> s
        0x54: new IntegerReg(0x74),  // T -> t
        0x55: new IntegerReg(0x75),  // U -> u
        0x56: new IntegerReg(0x76),  // V -> v
        0x57: new IntegerReg(0x77),  // W -> w
        0x58: new IntegerReg(0x78),  // X -> x
        0x59: new IntegerReg(0x79),  // Y -> y
        0x5A: new IntegerReg(0x7A),  // Z -> z
        0x61: new IntegerReg(0x61),  // a -> a
        0x62: new IntegerReg(0x62),  // b -> b
        0x63: new IntegerReg(0x63),  // c -> c
        0x64: new IntegerReg(0x64),  // d -> d
        0x65: new IntegerReg(0x65),  // e -> e
        0x66: new IntegerReg(0x66),  // f -> f
        0x67: new IntegerReg(0x67),  // g -> g
        0x68: new IntegerReg(0x68),  // h -> h
        0x69: new IntegerReg(0x69),  // i -> i
        0x6A: new IntegerReg(0x6A),  // j -> j
        0x6B: new IntegerReg(0x6B),  // k -> k
        0x6C: new IntegerReg(0x6C),  // l -> l
        0x6D: new IntegerReg(0x6D),  // m -> m
        0x6E: new IntegerReg(0x6E),  // n -> n
        0x6F: new IntegerReg(0x6F),  // o -> o
        0x70: new IntegerReg(0x70),  // p -> p
        0x71: new IntegerReg(0x71),  // q -> q
        0x72: new IntegerReg(0x72),  // r -> r
        0x73: new IntegerReg(0x73),  // s -> s
        0x74: new IntegerReg(0x74),  // t -> t
        0x75: new IntegerReg(0x75),  // u -> u
        0x76: new IntegerReg(0x76),  // v -> v
        0x77: new IntegerReg(0x77),  // w -> w
        0x78: new IntegerReg(0x78),  // x -> x
        0x79: new IntegerReg(0x79),  // y -> y
        0x7A: new IntegerReg(0x7A),  // z -> z
        // Greek letters also have a \lccode here since they have uppercase and lowercase
        // letters just like in a Latin alphabet.
        0x0391: new IntegerReg(0x03B1),  // Α -> α
        0x0392: new IntegerReg(0x03B2),  // Β -> β
        0x0393: new IntegerReg(0x03B3),  // Γ -> γ
        0x0394: new IntegerReg(0x03B4),  // Δ -> δ
        0x0395: new IntegerReg(0x03B5),  // Ε -> ε
        0x0396: new IntegerReg(0x03B6),  // Ζ -> ζ
        0x0397: new IntegerReg(0x03B7),  // Η -> η
        0x0398: new IntegerReg(0x03B8),  // Θ -> θ
        0x0399: new IntegerReg(0x03B9),  // Ι -> ι
        0x039A: new IntegerReg(0x03BA),  // Κ -> κ
        0x039B: new IntegerReg(0x03BB),  // Λ -> λ
        0x039C: new IntegerReg(0x03BC),  // Μ -> μ
        0x039D: new IntegerReg(0x03BD),  // Ν -> ν
        0x039E: new IntegerReg(0x03BE),  // Ξ -> ξ
        0x039F: new IntegerReg(0x03BF),  // Ο -> ο
        0x03A0: new IntegerReg(0x03C0),  // Π -> π
        0x03A1: new IntegerReg(0x03C1),  // Ρ -> ρ
        0x03A3: new IntegerReg(0x03C3),  // Σ -> σ
        0x03A4: new IntegerReg(0x03C4),  // Τ -> τ
        0x03A5: new IntegerReg(0x03C5),  // Υ -> υ
        0x03A6: new IntegerReg(0x03C6),  // Φ -> φ
        0x03A7: new IntegerReg(0x03C7),  // Χ -> χ
        0x03A8: new IntegerReg(0x03C8),  // Ψ -> ψ
        0x03A9: new IntegerReg(0x03C9),  // Ω -> ω
        0x03B1: new IntegerReg(0x03B1),  // α -> α
        0x03B2: new IntegerReg(0x03B2),  // β -> β
        0x03B3: new IntegerReg(0x03B3),  // γ -> γ
        0x03B4: new IntegerReg(0x03B4),  // δ -> δ
        0x03B5: new IntegerReg(0x03B5),  // ε -> ε
        0x03B6: new IntegerReg(0x03B6),  // ζ -> ζ
        0x03B7: new IntegerReg(0x03B7),  // η -> η
        0x03B8: new IntegerReg(0x03B8),  // θ -> θ
        0x03B9: new IntegerReg(0x03B9),  // ι -> ι
        0x03BA: new IntegerReg(0x03BA),  // κ -> κ
        0x03BB: new IntegerReg(0x03BB),  // λ -> λ
        0x03BC: new IntegerReg(0x03BC),  // μ -> μ
        0x03BD: new IntegerReg(0x03BD),  // ν -> ν
        0x03BE: new IntegerReg(0x03BE),  // ξ -> ξ
        0x03BF: new IntegerReg(0x03BF),  // ο -> ο
        0x03C0: new IntegerReg(0x03C0),  // π -> π
        0x03C1: new IntegerReg(0x03C1),  // ρ -> ρ
        0x03C3: new IntegerReg(0x03C3),  // σ -> σ
        0x03C4: new IntegerReg(0x03C4),  // τ -> τ
        0x03C5: new IntegerReg(0x03C5),  // υ -> υ
        0x03C6: new IntegerReg(0x03C6),  // φ -> φ
        0x03C7: new IntegerReg(0x03C7),  // χ -> χ
        0x03C8: new IntegerReg(0x03C8),  // ψ -> ψ
        0x03C9: new IntegerReg(0x03C9),  // ω -> ω
      },
      uc: {
        // This is the same the \lccode, except it defines the uppercase character's char-
        // acter code (used for \uccode).
        0x41: new IntegerReg(0x41),  // A -> A
        0x42: new IntegerReg(0x42),  // B -> B
        0x43: new IntegerReg(0x43),  // C -> C
        0x44: new IntegerReg(0x44),  // D -> D
        0x45: new IntegerReg(0x45),  // E -> E
        0x46: new IntegerReg(0x46),  // F -> F
        0x47: new IntegerReg(0x47),  // G -> G
        0x48: new IntegerReg(0x48),  // H -> H
        0x49: new IntegerReg(0x49),  // I -> I
        0x4A: new IntegerReg(0x4A),  // J -> J
        0x4B: new IntegerReg(0x4B),  // K -> K
        0x4C: new IntegerReg(0x4C),  // L -> L
        0x4D: new IntegerReg(0x4D),  // M -> M
        0x4E: new IntegerReg(0x4E),  // N -> N
        0x4F: new IntegerReg(0x4F),  // O -> O
        0x50: new IntegerReg(0x50),  // P -> P
        0x51: new IntegerReg(0x51),  // Q -> Q
        0x52: new IntegerReg(0x52),  // R -> R
        0x53: new IntegerReg(0x53),  // S -> S
        0x54: new IntegerReg(0x54),  // T -> T
        0x55: new IntegerReg(0x55),  // U -> U
        0x56: new IntegerReg(0x56),  // V -> V
        0x57: new IntegerReg(0x57),  // W -> W
        0x58: new IntegerReg(0x58),  // X -> X
        0x59: new IntegerReg(0x59),  // Y -> Y
        0x5A: new IntegerReg(0x5A),  // Z -> Z
        0x61: new IntegerReg(0x41),  // a -> A
        0x62: new IntegerReg(0x42),  // b -> B
        0x63: new IntegerReg(0x43),  // c -> C
        0x64: new IntegerReg(0x44),  // d -> D
        0x65: new IntegerReg(0x45),  // e -> E
        0x66: new IntegerReg(0x46),  // f -> F
        0x67: new IntegerReg(0x47),  // g -> G
        0x68: new IntegerReg(0x48),  // h -> H
        0x69: new IntegerReg(0x49),  // i -> I
        0x6A: new IntegerReg(0x4A),  // j -> J
        0x6B: new IntegerReg(0x4B),  // k -> K
        0x6C: new IntegerReg(0x4C),  // l -> L
        0x6D: new IntegerReg(0x4D),  // m -> M
        0x6E: new IntegerReg(0x4E),  // n -> N
        0x6F: new IntegerReg(0x4F),  // o -> O
        0x70: new IntegerReg(0x50),  // p -> P
        0x71: new IntegerReg(0x51),  // q -> Q
        0x72: new IntegerReg(0x52),  // r -> R
        0x73: new IntegerReg(0x53),  // s -> S
        0x74: new IntegerReg(0x54),  // t -> T
        0x75: new IntegerReg(0x55),  // u -> U
        0x76: new IntegerReg(0x56),  // v -> V
        0x77: new IntegerReg(0x57),  // w -> W
        0x78: new IntegerReg(0x58),  // x -> X
        0x79: new IntegerReg(0x59),  // y -> Y
        0x7A: new IntegerReg(0x5A),  // z -> Z
        0x0391: new IntegerReg(0x0391),  // Α -> Α
        0x0392: new IntegerReg(0x0392),  // Β -> Β
        0x0393: new IntegerReg(0x0393),  // Γ -> Γ
        0x0394: new IntegerReg(0x0394),  // Δ -> Δ
        0x0395: new IntegerReg(0x0395),  // Ε -> Ε
        0x0396: new IntegerReg(0x0396),  // Ζ -> Ζ
        0x0397: new IntegerReg(0x0397),  // Η -> Η
        0x0398: new IntegerReg(0x0398),  // Θ -> Θ
        0x0399: new IntegerReg(0x0399),  // Ι -> Ι
        0x039A: new IntegerReg(0x039A),  // Κ -> Κ
        0x039B: new IntegerReg(0x039B),  // Λ -> Λ
        0x039C: new IntegerReg(0x039C),  // Μ -> Μ
        0x039D: new IntegerReg(0x039D),  // Ν -> Ν
        0x039E: new IntegerReg(0x039E),  // Ξ -> Ξ
        0x039F: new IntegerReg(0x039F),  // Ο -> Ο
        0x03A0: new IntegerReg(0x03A0),  // Π -> Π
        0x03A1: new IntegerReg(0x03A1),  // Ρ -> Ρ
        0x03A3: new IntegerReg(0x03A3),  // Σ -> Σ
        0x03A4: new IntegerReg(0x03A4),  // Τ -> Τ
        0x03A5: new IntegerReg(0x03A5),  // Υ -> Υ
        0x03A6: new IntegerReg(0x03A6),  // Φ -> Φ
        0x03A7: new IntegerReg(0x03A7),  // Χ -> Χ
        0x03A8: new IntegerReg(0x03A8),  // Ψ -> Ψ
        0x03A9: new IntegerReg(0x03A9),  // Ω -> Ω
        0x03B1: new IntegerReg(0x0391),  // α -> Α
        0x03B2: new IntegerReg(0x0392),  // β -> Β
        0x03B3: new IntegerReg(0x0393),  // γ -> Γ
        0x03B4: new IntegerReg(0x0394),  // δ -> Δ
        0x03B5: new IntegerReg(0x0395),  // ε -> Ε
        0x03B6: new IntegerReg(0x0396),  // ζ -> Ζ
        0x03B7: new IntegerReg(0x0397),  // η -> Η
        0x03B8: new IntegerReg(0x0398),  // θ -> Θ
        0x03B9: new IntegerReg(0x0399),  // ι -> Ι
        0x03BA: new IntegerReg(0x039A),  // κ -> Κ
        0x03BB: new IntegerReg(0x039B),  // λ -> Λ
        0x03BC: new IntegerReg(0x039C),  // μ -> Μ
        0x03BD: new IntegerReg(0x039D),  // ν -> Ν
        0x03BE: new IntegerReg(0x039E),  // ξ -> Ξ
        0x03BF: new IntegerReg(0x039F),  // ο -> Ο
        0x03C0: new IntegerReg(0x03A0),  // π -> Π
        0x03C1: new IntegerReg(0x03A1),  // ρ -> Ρ
        0x03C3: new IntegerReg(0x03A3),  // σ -> Σ
        0x03C4: new IntegerReg(0x03A4),  // τ -> Τ
        0x03C5: new IntegerReg(0x03A5),  // υ -> Υ
        0x03C6: new IntegerReg(0x03A6),  // φ -> Φ
        0x03C7: new IntegerReg(0x03A7),  // χ -> Χ
        0x03C8: new IntegerReg(0x03A8),  // ψ -> Ψ
        0x03C9: new IntegerReg(0x03A9),  // ω -> Ω
      }
    }
  
    const registerPrimitives = [
      data.defs.primitive.catcode,
      data.defs.primitive.count,
      data.defs.primitive.day,
      data.defs.primitive.dimen,
      data.defs.primitive.lccode,
      data.defs.primitive.mathcode,
      data.defs.primitive.meaning,
      data.defs.primitive.month,
      data.defs.primitive.muskip,
      data.defs.primitive.skip,
      data.defs.primitive.time,
      data.defs.primitive.uccode,
      data.defs.primitive.year
    ];
  
    const expandablePrimitives = [
      data.defs.primitive.the,
      data.defs.primitive.expandafter,
      data.defs.primitive.number,
      data.defs.primitive.romannumeral,
      data.defs.primitive.csname,
      data.defs.primitive.string,
      data.defs.primitive.if,
      data.defs.primitive.ifcase,
      data.defs.primitive.ifcat,
      data.defs.primitive.ifdim,
      data.defs.primitive.ifeof,
      data.defs.primitive.iffalse,
      data.defs.primitive.ifodd,
      data.defs.primitive.ifnum,
      data.defs.primitive.ifhmode,
      data.defs.primitive.ifinner,
      data.defs.primitive.ifmmode,
      data.defs.primitive.iftrue,
      data.defs.primitive.ifvmode,
      data.defs.primitive.ifvoid,
      data.defs.primitive.ifx
    ];
  
    // The definition for \crcr is exactly the same as \cr (it's just ignored in cert-
    // ain cases.
    data.defs.primitive.crcr.function = data.defs.primitive.cr.function;
  
    // `evalIf' is used by all \if commands. It gets a boolean argument specifying
    // whether the \if evaluated to true or false. It also gets a mouth argument to
    // take and evaluate tokens from.
    function evalIf(success, mouth, scopes, stateSymbol) {
  
      var tokens = [];
      if (success) {
        // The \if was evaluated to true. All the text immediately after up until the first
        // \else or \fi is evaluated. If an \else is found, all the text until the first
        // \fi is skipped.
        while (true) {
          var token = mouth.eat();
  
          if (!token) {
            this.invalid = true;
            mouth.loadState(stateSymbol);
            return [this];
          } else if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
            // If a command was found, expand it unless it's a \else or \fi.
            var macro = token.type == 'command' ? scopes.last().defs.primitive[token.name] || scopes.last().defs.macros[token.name] : scopes.last().defs.active[token.char];
  
            if (!macro) {
              tokens.push(token);
              continue;
            }
  
            if ((macro === data.defs.primitive.if         || macro.isLet && macro.original === data.defs.primitive.if)           ||
              (macro === data.defs.primitive.ifcase       || macro.isLet && macro.original === data.defs.primitive.ifcase)       ||
              (macro === data.defs.primitive.ifcat        || macro.isLet && macro.original === data.defs.primitive.ifcat)        ||
              (macro === data.defs.primitive.ifdim        || macro.isLet && macro.original === data.defs.primitive.ifdim)        ||
              (macro === data.defs.primitive.ifeof        || macro.isLet && macro.original === data.defs.primitive.ifeof)        ||
              (macro === data.defs.primitive.iffalse      || macro.isLet && macro.original === data.defs.primitive.iffalse)      ||
              (macro === data.defs.primitive.ifodd        || macro.isLet && macro.original === data.defs.primitive.ifodd)        ||
              (macro === data.defs.primitive.ifnum        || macro.isLet && macro.original === data.defs.primitive.ifnum)        ||
              (macro === data.defs.primitive.ifhmode      || macro.isLet && macro.original === data.defs.primitive.ifhmode)      ||
              (macro === data.defs.primitive.ifinner      || macro.isLet && macro.original === data.defs.primitive.ifinner)      ||
              (macro === data.defs.primitive.ifmmode      || macro.isLet && macro.original === data.defs.primitive.ifmmode)      ||
              (macro === data.defs.primitive.iftrue       || macro.isLet && macro.original === data.defs.primitive.iftrue)       ||
              (macro === data.defs.primitive.ifvmode      || macro.isLet && macro.original === data.defs.primitive.ifvmode)      ||
              (macro === data.defs.primitive.ifvoid       || macro.isLet && macro.original === data.defs.primitive.ifvoid)       ||
              (macro === data.defs.primitive.ifx          || macro.isLet && macro.original === data.defs.primitive.ifx)) {
              // If a \if was found, all the tokens up to the next \fi are added to `tokens'. The
              // \if isn't expanded.
              var expansion = goToFi();
              if (expansion) {
                tokens.push(token);
                tokens.push.apply(tokens, expansion);
                continue;
              } else {
                this.invalid = true;
                mouth.loadState(stateSymbol);
                return [this];
              }
            } else if (macro === data.defs.primitive.else || macro.proxy && macro.original === data.defs.primitive.else) {
              // A \else was found. Skip all the next tokens until a \fi. `skipUntil' won't eval-
              // uate the \fi. That has to be done on the next iteration of the while loop.
              skipUntil('fi');
              continue;
            } else if (macro === data.defs.primitive.fi || macro.proxy && macro.original === data.defs.primitive.fi) {
              // A \fi was found. The \if block is done and can return the tokens now.
              break;
            } else {
              // A nonexpandable primitive or a macro was found. It should be added as a regular
              // token that will expand after the whole \if is done being executed.
              tokens.push(token);
            }
          } else {
            // The token is just a regular unexpandable token. Add it to the list. These tokens
            // will be returned and evaluated later.
            tokens.push(token);
          }
        }
      } else {
        // The \if was evaluated to false. All the tokens up until the first \else or \fi
        // are skipped. If there is no \else, then no tokens are expanded or returned.
        skipUntil('else');
        while (true) {
          var token = mouth.eat();
  
          if (!token) {
            this.invalid = true;
            mouth.loadState(stateSymbol);
            return [this];
          } else if (token.type == 'command' || token.type == 'character' && token.cat == catcodes.ACTIVE) {
            var macro = token.type == 'command' ? scopes.last().defs.primitive[token.name] || scopes.last().defs.macros[token.name] : scopes.last().defs.active[token.char];
            // There is no \else special if block here because it should have already been e-
            // valuated. Instead, it's expanded naturally, which will mark it as invalid for
            // being in the wrong context.
  
            if (!macro) {
              tokens.push(token);
              continue;
            }
  
            if ((macro === data.defs.primitive.if         || macro.isLet && macro.original === data.defs.primitive.if)           ||
              (macro === data.defs.primitive.ifcase       || macro.isLet && macro.original === data.defs.primitive.ifcase)       ||
              (macro === data.defs.primitive.ifcat        || macro.isLet && macro.original === data.defs.primitive.ifcat)        ||
              (macro === data.defs.primitive.ifdim        || macro.isLet && macro.original === data.defs.primitive.ifdim)        ||
              (macro === data.defs.primitive.ifeof        || macro.isLet && macro.original === data.defs.primitive.ifeof)        ||
              (macro === data.defs.primitive.iffalse      || macro.isLet && macro.original === data.defs.primitive.iffalse)      ||
              (macro === data.defs.primitive.ifodd        || macro.isLet && macro.original === data.defs.primitive.ifodd)        ||
              (macro === data.defs.primitive.ifnum        || macro.isLet && macro.original === data.defs.primitive.ifnum)        ||
              (macro === data.defs.primitive.ifhmode      || macro.isLet && macro.original === data.defs.primitive.ifhmode)      ||
              (macro === data.defs.primitive.ifinner      || macro.isLet && macro.original === data.defs.primitive.ifinner)      ||
              (macro === data.defs.primitive.ifmmode      || macro.isLet && macro.original === data.defs.primitive.ifmmode)      ||
              (macro === data.defs.primitive.iftrue       || macro.isLet && macro.original === data.defs.primitive.iftrue)       ||
              (macro === data.defs.primitive.ifvmode      || macro.isLet && macro.original === data.defs.primitive.ifvmode)      ||
              (macro === data.defs.primitive.ifvoid       || macro.isLet && macro.original === data.defs.primitive.ifvoid)       ||
              (macro === data.defs.primitive.ifx          || macro.isLet && macro.original === data.defs.primitive.ifx)) {
              var expansion = goToFi();
              if (expansion) {
                tokens.push(token);
                tokens.push.apply(tokens, expansion);
                continue;
              } else {
                this.invalid = true;
                mouth.loadState(stateSymbol);
                return [this];
              }
            } else if (macro && (macro === data.defs.primitive.fi || macro.proxy && macro.original === data.defs.primitive.fi)) {
              break;
            } else {
              tokens.push(token);
            }
          } else {
            tokens.push(token);
          }
        }
      }
  
      return tokens;
  
      // `skipUntil' is the function used to skip over tokens. If a \if is false, then
      // text immediately after it is skipped until either an \else of \fi (or \or if it
      // is \ifcase). This function will skip until it matches the correct token (the
      // argument `elseFi' is either "else" or "fi"). If "else" is provided, it will also
      // look for \fi since there sometimes isn't an \else. \if ... \fi nesting is taken
      // into consideration.
      function skipUntil(elseFi) {
        while (true) {
          var token = mouth.eat();
  
          if (!token) {
            return;
          } else if (token.type == 'command' || token.type == 'character' && token.cat === catcodes.ACTIVE) {
            var macro = token.type == 'command' ? scopes.last().defs.primitive[token.name] || scopes.last().defs.macros[token.name] : scopes.last().defs.active[token.char];
  
            if (!macro) continue;
  
            // Test if the macro is a \if (or \let to be one). If it is, `skipUntil' is called
            // recursively until a \fi is found. Then it'll return to the current level of
            // skipping.
            if ((macro === data.defs.primitive.if      || macro.isLet && macro.original === data.defs.primitive.if)      ||
              (macro === data.defs.primitive.ifcase  || macro.isLet && macro.original === data.defs.primitive.ifcase)  ||
              (macro === data.defs.primitive.ifcat   || macro.isLet && macro.original === data.defs.primitive.ifcat)   ||
              (macro === data.defs.primitive.ifdim   || macro.isLet && macro.original === data.defs.primitive.ifdim)   ||
              (macro === data.defs.primitive.ifeof   || macro.isLet && macro.original === data.defs.primitive.ifeof)   ||
              (macro === data.defs.primitive.iffalse || macro.isLet && macro.original === data.defs.primitive.iffalse) ||
              (macro === data.defs.primitive.ifodd   || macro.isLet && macro.original === data.defs.primitive.ifodd)   ||
              (macro === data.defs.primitive.ifnum   || macro.isLet && macro.original === data.defs.primitive.ifnum)   ||
              (macro === data.defs.primitive.ifhmode || macro.isLet && macro.original === data.defs.primitive.ifhmode) ||
              (macro === data.defs.primitive.ifinner || macro.isLet && macro.original === data.defs.primitive.ifinner) ||
              (macro === data.defs.primitive.ifmmode || macro.isLet && macro.original === data.defs.primitive.ifmmode) ||
              (macro === data.defs.primitive.iftrue  || macro.isLet && macro.original === data.defs.primitive.iftrue)  ||
              (macro === data.defs.primitive.ifvmode || macro.isLet && macro.original === data.defs.primitive.ifvmode) ||
              (macro === data.defs.primitive.ifvoid  || macro.isLet && macro.original === data.defs.primitive.ifvoid)  ||
              (macro === data.defs.primitive.ifx     || macro.isLet && macro.original === data.defs.primitive.ifx)) {
  
              // `skipUntil' is called to look for the closing \fi.
              skipUntil('fi');
              // `skipUntil' does not absorb the \fi token, so it has to be eaten manually. If
              // there was no \fi token, then there must be NO tokens left, so `mouth.eat()'
              // won't do anything and the missing tokens will be token care of on the next loop.
              mouth.eat();
              continue;
            }
  
            // Now, if `elseFi' is "else", then check for a \else token. If a \else IS found,
            // it's absorbed before returning (i.e. there's no need to revert).
            if (elseFi == 'else' && (macro === data.defs.primitive.else || macro.isLet && macro.original === data.defs.primitive.else)) {
              return;
            }
  
            // Now, check for \fi. It doesn't matter if `elseFi' is "else" or "fi"; both cases
            // stop at a \fi. The \fi token shouldn't be absorbed though, so the mouth is
            // reverted.
            if (macro === data.defs.primitive.fi || macro.isLet && macro.original === data.defs.primitive.fi) {
              mouth.revert();
              return;
            }
          }
        }
      }
  
      // `goToFi' will skip tokens similar to `skipUntil'. It'll look for the next \fi
      // and return the list of tokens that were passed in between. If a \if is found
      // while going through tokens, all the tokens between up until the \fi needs to
      // be returned without being evaluated yet.
      function goToFi() {
        var tokens = [];
        while (true) {
          var token = mouth.eat();
  
          if (!token) {
            return null;
          } else if (token.type == 'command' || token.type == 'character' && token.cat === catcodes.ACTIVE) {
            var macro = token.type == 'command' ? scopes.last().defs.primitive[token.name] || scopes.last().defs.macros[token.name] : scopes.last().defs.active[token.char];
  
            if (!macro) {
              tokens.push(token);
              continue;
            }
  
            // If another \if was found, an extra \fi needs to be found first.
            if ((macro === data.defs.primitive.if      || macro.isLet && macro.original === data.defs.primitive.if)      ||
              (macro === data.defs.primitive.ifcase  || macro.isLet && macro.original === data.defs.primitive.ifcase)  ||
              (macro === data.defs.primitive.ifcat   || macro.isLet && macro.original === data.defs.primitive.ifcat)   ||
              (macro === data.defs.primitive.ifdim   || macro.isLet && macro.original === data.defs.primitive.ifdim)   ||
              (macro === data.defs.primitive.ifeof   || macro.isLet && macro.original === data.defs.primitive.ifeof)   ||
              (macro === data.defs.primitive.iffalse || macro.isLet && macro.original === data.defs.primitive.iffalse) ||
              (macro === data.defs.primitive.ifodd   || macro.isLet && macro.original === data.defs.primitive.ifodd)   ||
              (macro === data.defs.primitive.ifnum   || macro.isLet && macro.original === data.defs.primitive.ifnum)   ||
              (macro === data.defs.primitive.ifhmode || macro.isLet && macro.original === data.defs.primitive.ifhmode) ||
              (macro === data.defs.primitive.ifinner || macro.isLet && macro.original === data.defs.primitive.ifinner) ||
              (macro === data.defs.primitive.ifmmode || macro.isLet && macro.original === data.defs.primitive.ifmmode) ||
              (macro === data.defs.primitive.iftrue  || macro.isLet && macro.original === data.defs.primitive.iftrue)  ||
              (macro === data.defs.primitive.ifvmode || macro.isLet && macro.original === data.defs.primitive.ifvmode) ||
              (macro === data.defs.primitive.ifvoid  || macro.isLet && macro.original === data.defs.primitive.ifvoid)  ||
              (macro === data.defs.primitive.ifx     || macro.isLet && macro.original === data.defs.primitive.ifx)) {
              var expansion = goToFi();
              if (expansion) {
                tokens.push(token);
                tokens.push.apply(tokens, expansion)
                continue;
              } else return null;
            }
            tokens.push(token);
            if (macro === data.defs.primitive.fi || macro.isLet && macro.original === data.defs.primitive.fi) {
              return tokens;
            }
          } else {
            tokens.push(token);
          }
        }
      }
    }
  
  
  
    // In order to initialize TeX, some definitions need to be made for macros. This is where all that
    // happens. It uses String.raw to prevent having to do something special with backslashes, but it
    // also means all "`" characters are replaced with "${grave}".
    let grave = "`";
    fontTeX.global(String.raw`
      \def\makeatletter{\catcode${grave}\@=11\relax}
      \def\makeatother{\catcode${grave}\@=12\relax}
      \makeatletter
      \count10=23
      \count11=9
      \count12=9
      \count13=9
      \countdef\insc@unt=20
      \countdef\allocationnumber=21
      \countdef\m@ne=22 \m@ne=-1
      \countdef\count@=255
      \dimendef\dimen@=0
      \dimendef\dimen@i=1
      \dimendef\dimen@ii=2
      \skipdef\skip@=0
      \def\newcount{\alloc@0\count\countdef}
      \def\newdimen{\alloc@1\dimen\dimendef}
      \def\newskip{\alloc@2\skip\skipdef}
      \def\newmuskip{\alloc@3\muskip\muskipdef}
      \def\alloc@#1#2#3#4{
        \advance\count1#1by1
        \allocationnumber=\count1#1
        #3#4=\allocationnumber
      }
      \newdimen\maxdimen \maxdimen=137438953471.99998pt
      \newskip\hideskip \hideskip=-1000pt plus 1fil
      \newskip\centering \centering=0pt plus 1000pt minus 1000pt
      \def\newif#1{
        {\lccode${grave}9=${grave}i \lccode${grave}8=${grave}f \lowercase{\gdef\@remove@if##198##2{##2}}}
        \expandafter\expandafter\expandafter
        \def\expandafter\expandafter\expandafter
        \@if@name\expandafter\expandafter\expandafter{\expandafter\@remove@if\string#1}
        \expandafter\def\expandafter\@if@name@bool\expandafter##\expandafter1\expandafter{\@if@name##1}
        \expandafter\def\csname\@if@name@bool{true}\endcsname{
          \let#1=\iftrue
        }
        \expandafter\def\csname\@if@name@bool{false}\endcsname{
          \let#1=\iffalse
        }
        \let#1=\iffalse
        \let\@if@name=\undefined
        \let\@if@name@bool=\undefined
        \let\@remove@if=\undefined
      }
      \newcount\active \active=13
      \newskip\smallskipamount \smallskipamount=3pt plus 1pt minus 1pt
      \newskip\medskipamount \medskipamount=6pt plus 2pt minus 2pt
      \newskip\bigskipamount \bigskipamount=12pt plus 4pt minus 4pt
      \newskip\normalbaselineskip \normalbaselineskip=12pt
      \newskip\normallineskip \normallineskip=1pt
      \newdimen\normallineskiplimit \normallineskiplimit=0pt
      \newdimen\jot \jot=3pt
      \newcount\interdisplaylinepenalty \interdisplaylinepenalty=100
      \newcount\interfootnotelinepenalty \interfootnotelinepenalty=100
      \mathchardef\\="0000A
      \mathchardef\ ="0020
      \mathchardef\{=${grave}\{
      \mathchardef\}=${grave}\}
      \mathchardef\$=${grave}\$
      \mathchardef\#=${grave}\#
      \mathchardef\%=${grave}\%
      \mathchardef\&=${grave}\&
      \mathchardef\_=${grave}\_
      \mathchardef\aa="700E5
      \mathchardef\ae="700E6
      \mathchardef\aleph="02135
      \mathchardef\alpha="703B1
      \mathchardef\amalg="22A3F
      \mathchardef\angle="02220
      \mathchardef\approx="32248
      \mathchardef\arrowvert="023D0
      \mathchardef\ast="2002A
      \mathchardef\asymp="3224D
      \mathchardef\backslash=${grave}\\
      \mathchardef\beta="703B2
      \mathchardef\bigcap="122C2
      \mathchardef\bigcirc="225EF
      \mathchardef\bigcup="122C3
      \mathchardef\bigodot="12A00
      \mathchardef\bigoplus="12A01
      \mathchardef\bigotimes="12A02
      \mathchardef\bigtriangleup="225B3
      \mathchardef\bigtriangledown="225BD
      \mathchardef\bigsqcup="12A06
      \mathchardef\biguplus="12A04
      \mathchardef\bigvee="122C1
      \mathchardef\bigwedge="122C0
      \mathchardef\bot="022A5
      \mathchardef\bracevert="023AA
      \mathchardef\bowtie="322C8
      \mathchardef\bullet="22022
      \mathchardef\cap="22229
      \mathchardef\cdot="222C5
      \mathchardef\cdotp="622C5
      \mathchardef\chi="703C7
      \mathchardef\circ="225CB
      \mathchardef\clubsuit="02663
      \mathchardef\colon="6003A
      \mathchardef\cong="32245
      \mathchardef\coprod="12210
      \mathchardef\cup="2222A
      \mathchardef\dag="02020
      \mathchardef\dagger="22020
      \mathchardef\dashv="322A3
      \mathchardef\ddag="02021
      \mathchardef\ddagger="22021
      \mathchardef\delta="703B4
      \mathchardef\diamond="222C4
      \mathchardef\diamondsuit="02662
      \mathchardef\div="200F7
      \mathchardef\doteq="32250
      \mathchardef\downarrow="02193
      \mathchardef\ell="02113
      \mathchardef\emptyset="02205
      \mathchardef\epsilon="703F5
      \mathchardef\equiv="32261
      \mathchardef\eta="703B7
      \mathchardef\exists="02203
      \mathchardef\flat="0266D
      \mathchardef\forall="02200
      \mathchardef\frown="32322
      \mathchardef\gamma="703B3
      \mathchardef\ge="32265 \let\geq=\ge
      \mathchardef\gg="3226B
      \mathchardef\hbar="70127
      \mathchardef\heartsuit="02661
      \mathchardef\hookleftarrow="321AA
      \mathchardef\hookrightarrow="321A9
      \mathchardef\imath="70131
      \mathchardef\in="32208
      \mathchardef\infty="0221E
      \mathchardef\intop="1222B \def\int{\intop\nolimits}
      \mathchardef\iota="703B9
      \mathchardef\jmath="70237
      \mathchardef\kappa="703BA
      \mathchardef\l="00142
      \mathchardef\lambda="703BB
      \mathchardef\langle="027E8
      \mathchardef\lbrace=${grave}\{
      \mathchardef\lceil="02308
      \mathchardef\ldotp="6002E
      \mathchardef\le="32264 \let\leq=\le
      \mathchardef\leftarrow="32190 \let\gets=\leftarrow
      \mathchardef\leftharpoondown="321BD
      \mathchardef\leftharpoonup="321BC
      \mathchardef\leftrightarrow="32194
      \mathchardef\lfloor="0230A
      \mathchardef\lgroup="027EE
      \mathchardef\ll="3226A
      \mathchardef\lmoustache="023B0
      \mathchardef\longleftarrow="327F5
      \mathchardef\longleftrightarrow="327F7
      \mathchardef\longmapsto="327FC
      \mathchardef\longrightarrow="327F6
      \mathchardef\mapsto="321A6
      \mathchardef\mid="32223
      \mathchardef\models="322A7
      \mathchardef\mp="22213
      \mathchardef\mu="703BC
      \mathchardef\nabla="02207
      \mathchardef\natural="0266E
      \mathchardef\nearrow="32197
      \mathchardef\neg="000AC \let\lnot=\neg
      \mathchardef\ne="32260 \let\neq=\ne
      \mathchardef\ni="3220B \let\owns=\ni
      \mathchardef\notin="32209
      \mathchardef\nu="703BD
      \mathchardef\nwarrow="32196
      \mathchardef\o="700F8
      \mathchardef\odot="22299
      \mathchardef\oe="70153
      \mathchardef\ointop="1222E \def\oint{\ointop\nolimits}
      \mathchardef\omega="703C9
      \mathchardef\ominus="22296
      \mathchardef\oplus="22295
      \mathchardef\oslash="22298
      \mathchardef\otimes="22297
      \mathchardef\parallel="32225
      \mathchardef\partial="02202
      \mathchardef\perp="322A5
      \mathchardef\phi="703D5
      \mathchardef\pi="703C0
      \mathchardef\pm="200B1
      \mathchardef\prec="3227A
      \mathchardef\preceq="3227C
      \mathchardef\prime="02032
      \mathchardef\prod="1220F
      \mathchardef\propto="3221D
      \mathchardef\psi="703C8
      \mathchardef\rangle="027E9
      \mathchardef\rbrace=${grave}\}
      \mathchardef\rceil="02309
      \mathchardef\relbar="3002D
      \mathchardef\rfloor="0230B
      \mathchardef\rgroup="027EF
      \mathchardef\rho="703C1
      \mathchardef\rightarrow="32192 \let\to=\rightarrow
      \mathchardef\rightharpoondown="321C1
      \mathchardef\rightharpoonup="321C0
      \mathchardef\rightleftharpoons="321CC
      \mathchardef\rmoustache="023B1
      \mathchardef\searrow="32198
      \mathchardef\setminus="22216
      \mathchardef\sharp="0266F
      \mathchardef\sim="3223C
      \mathchardef\simeq="32243
      \mathchardef\sigma="703C3
      \mathchardef\smile="32323
      \mathchardef\sqcap="22293
      \mathchardef\sqcup="22294
      \mathchardef\sqsubseteq="32291
      \mathchardef\sqsupseteq="32292
      \mathchardef\ss="000DF
      \mathchardef\star="222C6
      \mathchardef\subset="32282
      \mathchardef\subseteq="32286
      \mathchardef\succ="3227B
      \mathchardef\succeq="3227D
      \mathchardef\sum="12211
      \mathchardef\supset="32283
      \mathchardef\supseteq="32287
      \mathchardef\swarrow="32199
      \mathchardef\tau="703C4
      \mathchardef\theta="703B8
      \mathchardef\times="200D7
      \mathchardef\top="022A4
      \mathchardef\triangle="025B3
      \mathchardef\triangleleft="225C1
      \mathchardef\triangleright="225B7
      \mathchardef\ucup="2228E
      \mathchardef\uparrow="02191
      \mathchardef\updownarrow="02195
      \mathchardef\upsilon="703C5
      \mathchardef\varepsilon="703B5
      \mathchardef\varphi="703C6
      \mathchardef\varpi="703D6
      \mathchardef\varrho="703F1
      \mathchardef\varsigma="703C2
      \mathchardef\vartheta="703D1
      \mathchardef\vdash="322A2
      \mathchardef\vee="22228 \let\lor=\vee
      \mathchardef\vert=${grave}\|
      \mathchardef\wedge="22227 \let\land=\wedge
      \mathchardef\wp="02118
      \mathchardef\wr="22240
      \mathchardef\xi="703BE
      \mathchardef\zeta="703B6
      \mathchardef\AA="700C5
      \mathchardef\AE="700C6
      \mathchardef\Arrowvert="02225
      \mathchardef\Delta="00394
      \mathchardef\Downarrow="21D3
      \mathchardef\Gamma="00393
      \mathchardef\Im="02111
      \mathchardef\L="00141
      \mathchardef\Lambda="0039B
      \mathchardef\Leftarrow="321D0
      \mathchardef\Leftrightarrow="321D4
      \mathchardef\Longleftarrow="327F8
      \mathchardef\Longleftrightarrow="327FA
      \mathchardef\Longrightarrow="327F9
      \mathchardef\O="700D8
      \mathchardef\OE="70152
      \mathchardef\Omega="003A9
      \mathchardef\Orb="225EF
      \mathchardef\P="000B6
      \mathchardef\Phi="003A6
      \mathchardef\Pi="003A0
      \mathchardef\Psi="003A8
      \mathchardef\Re="0211C
      \mathchardef\Relbar="3003D
      \mathchardef\Rightarrow="321D2
      \mathchardef\S="000A7
      \mathchardef\Sigma="003A3
      \mathchardef\spadesuit="02660
      \mathchardef\Theta="00398
      \mathchardef\Uparrow="021D1
      \mathchardef\Updownarrow="021D5
      \mathchardef\Upsilon="003A5
      \mathchardef\Vert="02016 \let\|=\Vert
      \mathchardef\Xi="0039E
      \def\~{\accent"02DC }
      \def\,{\mskip\thinmuskip}
      \def\>{\mskip\medmuskip}
      \def\;{\mskip\thickmuskip}
      \def\!{\mskip-\thinmuskip}
      \def\"{\accent"A8 }
      \def\={\accent"AF }
      \def\^{\accent"5E }
      \def\.{\accent"02D9 }
      \def\acute{\accent"B4 }
      \def\arccos{\mathop{\rm arccos}\nolimits}
      \def\arcsin{\mathop{\rm arcsin}\nolimits}
      \def\arctan{\mathop{\rm arctan}\nolimits}
      \def\arg{\mathop{\rm arg}\nolimits}
      \def\bar{\accent"AF }
      \def\big#1{{\n@space\left#1\vbox to 1em{}\right.}}
      \def\bigl{\mathopen\big}
      \def\bigm{\mathrel\big}
      \def\bigr{\mathclose\big}
      \def\bigg#1{{\n@space\left#1\vbox to 1.6em{}\right.}}
      \def\biggl{\mathopen\bigg}
      \def\biggm{\mathrel\bigg}
      \def\biggr{\mathclose\bigg}
      \def\bmod{\
        \nonscript\mskip-\medmuskip\mkern5mu\mathbin{\rm mod}\mkern5mu\nonscript\mskip-\medmuskip}
      \def\brace{\atopwithdelims\{\}}
      \def\brack{\atopwithdelims[]}
      \def\breve{\accent"02D8 }
      \def\buildrel#1\over#2{\mathrel{\mathop{\kern0pt#2}\limits^{#1}}}
      \def\cases#1{
        \left\{\,{\halign{##\hfil&\quad##\hfil\cr#1\crcr}}\right.}
      \def\cdots{\mathinner{\cdotp\cdotp\cdotp}}
      \def\check{\accent"02C7 }
      \def\choose{\atopwithdelims()}
      \def\cong{\mathrel{\tilde=}}
      \def\cos{\mathop{\rm cos}\nolimits}
      \def\cosh{\mathop{\rm cosh}\nolimits}
      \def\cot{\mathop{\rm cot}\nolimits}
      \def\coth{\mathop{\rm coth}\nolimits}
      \def\csc{\mathop{\rm csc}\nolimits}
      \def\ddot{\accent"A8 }
      \def\ddots{\mathinner{\char"22F1}}
      \def\deg{\mathop{\rm deg}\nolimits}
      \def\det{\mathop{\rm det}}
      \def\dim{\mathop{\rm dim}\nolimits}
      \def\dot{\accent"02D9 }
      \def\empty{}
      \def\exp{\mathop{\rm exp}\nolimits}
      \def\gcd{\mathop{\rm gcd}}
      \def\grave{\accent"60 }
      \def\hat{\accent"5E }
      \def\hom{\mathop{\rm hom}\nolimits}
      \def\hphantom#1{\vbox to0pt{\phantom#1}}
      \def\iff{\;\Longleftrightarrow\;}
      \def\inf{\mathop{\rm inf}}
      \def\iterate{\body \let\next=\iterate\else\let\next=\relax\fi\next}
      \def\joinrel{\mathrel{\mkern-3mu}}
      \def\ker{\mathop{\rm ker}\nolimits}
      \def\lbrack{[}
      \def\ldots{\mathinner{\ldotp\ldotp\ldotp}}
      \def\lg{\mathop{\rm lg}\nolimits}
      \def\lim{\mathop{\rm lim}}
      \def\liminf{\mathop{\rm lim\,inf}}
      \def\limsup{\mathop{\rm lim\,sup}}
      \def\ln{\mathop{\rm ln}\nolimits}
      \def\log{\mathop{\rm log}\nolimits}
      \def\loop#1\repeat{\def\body{#1}\iterate}
      \def\lq{${grave}}
      \def\mathstrut{\vphantom(}
      \def\matrix#1{\,\halign{\hfil##\hfil&&\quad\hfil##\hfil\cr#1\crcr}\,}
      \def\max{\mathop{\rm max}}
      \def\min{\mathop{\rm min}}
      \def\n@space{\nulldelimiterspace=0pt\relax}
      \def\not{\@ifnextchar={\mathchar"32260\@gobble}{\hbox to 0pt{/}}}}
      \def\null{\hbox{}}
      \def\pmatrix#1{\left(\matrix{#1}\right)}
      \def\pmod#1{\mkern18mu({\rm mod}\,\,#1)}
      \def\rbrack{]}
      \def\rq{\'}
      \def\sec{\mathop{\rm sec}\nolimits}
      \def\sin{\mathop{\rm sin}\nolimits}
      \def\sinh{\mathop{\rm sinh}\nolimits}
      \def\skew#1#2#3{{\muskip0 #1mu\divide\muskip0by2 \mkern\muskip0%
        #2{\mkern-\muskip0{#3}\mkern\muskip0}\mkern-\muskip0}{}}
      \def\strut{\vrule height.708333333emdepth.291666666emwidth0pt\relax}
      \def\sup{\mathop{\rm sup}}
      \def\surd{{\mathchar"1221A}}
      \def\t{\accent"0311 }
      \def\tan{\mathop{\rm tan}\nolimits}
      \def\tanh{\mathop{\rm tanh}\nolimits}
      \def\thinspace{\kern.1667em}
      \def\tilde{\accent"02DC }
      \def\u{\accent"02D8 }
      \def\v{\accent"02C7 }
      \def\vdots{\mathinner{\char"22EE}}
      \def\vphantom#1{\hbox to0pt{\phantom#1}}
      \def\Big#1{{\n@space\left#1\vbox to 1.3em{}\right.}}
      \def\Bigl{\mathopen\Big}
      \def\Bigm{\mathrel\Big}
      \def\Bigr{\mathclose\Big}
      \def\Bigg#1{{\n@space\left#1\vbox to 1.9em{}\right.}}
      \def\Biggl{\mathopen\Bigg}
      \def\Biggm{\mathrel\Bigg}
      \def\Biggr{\mathclose\Bigg}
      \def\H{\accent"02DD }
      \def\Pr{\mathop{\rm Pr}}
      \def\TeX{T\kern-.1667em{\lower.5exE}\kern-.125emX}
      \let\bgroup={
      \let\displaymath=\[
      \let\enddisplaymath=\]
      \let\egroup=}
      \let\endline=\cr
      \let\math=\(
      \let\endmath=\)
      \let\sb=^
      \let\sp=_
      \let\repeat=\fi
      \def\negthinspace{\kern-.1667em}
      \def\enspace{\kern.5em}
      \def\enskip{\hskip.5em\relax}
      \def\quad{\hskip1em\relax}
      \def\qquad{\hskip2em\relax}
      \def\smallskip{\vskip\smallskipamount}
      \def\medskip{\vskip\medskipamount}
      \def\bigskip{\vskip\bigskipamount}
      \def~{\char"00A0\relax}
      \def\obeyspaces{\catcode${grave}\ =13\relax}
      \catcode${grave}\ =12\def\space{ }\obeyspaces\let =\space
      \catcode${grave}\ =10
      \newcount\mscount
      \def\multispan#1{\omit \mscount#1\relax\loop\ifnum\mscount>1\sp@n\repeat}
      \def\sp@n{\span\omit\advance\mscount-1}
      \def\two@digits#1{\ifnum#1<10 0\fi\the#1}
      \def\dospecials{\do\ \do\\\do\{\do\}\do\$\do\&\do\#\do\^\do\^^K\do\_\do\^^A\do\%\do\~}
      \def\mathpalette#1#2{\
        \mathchoice{#1\displaystyle{#2}}{#1\textstyle{#2}}{#1\scriptstyle{#2}}{#1\scriptscriptstyle{#2}}}
      \def\binom#1#2{{{#1}\atopwithdelims(){#2}}}
      \def\frac#1#2{{{#1}\over{#2}}}
      \def\mathrm#1{{\rm#1}}
      \def\textrm#1{{\rm#1}}
      \def\mathbf#1{{\bf#1}}
      \def\textbf#1{{\bf#1}}
      \def\mathit#1{{\it#1}}
      \def\textit#1{{\it#1}}
      \def\mathsl#1{{\sl#1}}
      \def\textsl#1{{\sl#1}}
      \def\@gobble#1{}
      \def\@ifnextchar#1#2#3{
        \let\@ifnextchar@charone=#1
        \def\@ifnextchar@true{#2}
        \def\@ifnextchar@false{#3}
        \futurelet\@ifnextchar@chartwo\@ifnextchar@check}
      \def\@ifnextchar@check{
        \ifx\@ifnextchar@charone\@ifnextchar@chartwo\@ifnextchar@true\else\@ifnextchar@false\fi}
      \def\newcommand#1{\@ifnextchar[{\@newcommand#1}{\@newcommand#1[0]}}
      \def\@newcommand#1[#2]{
        \count0=#2
        \ifnum\count0<0
          \Error{Not Enough Parameters}
        \else
          \ifnum\count0>9
            \Error{TooManyParameters}
          \else
            \@ifnextchar[{\ifnum\count0<1
              \Error{ParameterNumberMustBe>0}
            \else
              \@newcommand@optarg#1[#2]
            \fi}{\@newcommand@nooptarg#1[#2]}
          \fi
        \fi
      }
      \def\@paramnums#1{
        \ifcase#1
        \or####1
        \or####1####2
        \or####1####2####3
        \or####1####2####3####4
        \or####1####2####3####4####5
        \or####1####2####3####4####5####6
        \or####1####2####3####4####5####6####7
        \or####1####2####3####4####5####6####7####8
        \or####1####2####3####4####5####6####7####8####9\fi}
      \def\@paramnums@bracket#1{
        \ifcase#1
        \or[####1]
        \or[####1]####2
        \or[####1]####2####3
        \or[####1]####2####3####4
        \or[####1]####2####3####4####5
        \or[####1]####2####3####4####5####6
        \or[####1]####2####3####4####5####6####7
        \or[####1]####2####3####4####5####6####7####8
        \or[####1]####2####3####4####5####6####7####8####9\fi}
      \def\@newcommand@nooptarg#1[#2]#{
        \edef\@newcommand@make{\def\noexpand#1\@paramnums#2}
        \@newcommand@make}
      \def\@newcommand@optarg#1[#2][#3]#{
        \def#1{
          \@ifnextchar[{\csname\string#1\endcsname}{\csname\string#1\endcsname[#3]}}
        \edef\@newcommand@make{
          \noexpand\expandafter\def
          \noexpand\csname\noexpand\string\noexpand#1\endcsname\@paramnums@bracket#2}
        \@newcommand@make}
      \newcommand\sqrt[1][]{\root #1\of }}
      \makeatother
    `);
  
    // `fontDimen` is used to measure font characters. TeX fonts usually have certain parame-
    // ters embedded in each character that tell TeX the height, depth, width, and italic correction
    // of a character. With a web font, we have none of those available to us, so we have to measure
    // them manually (along with some other measurements that come in handy). Since we won't have
    // access to every font's file, we can't take the data directly from the font itself; we have to
    // measure them manually by drawing a glyph onto a <canvas> and measuring its pixels. All the
    // functions defined here (except for `fontDimen.widthOf`) work the same way:
    // 1) Given a glyph, font family, and font style (like "it" for italic), draw the glyph entirely
    //    on a dedicated square <canvas> element
    // 2) Depending on what we are measuring, start from one side of the <canvas> and look at each
    //    column's/row's pixels one by one
    // 3) If none of that column/row had any pixels filled in, move on to the next column row, working
    //    our way in towards the opposite side of the <canvas> and repeat this step until we find one.
    // 4) Once we find a column/row with at least one darkened pixel, it means we've reached the
    //    boundary of the glyph. Iterate over the entire row and look for the darkest (least transpar-
    //    ent) pixel.
    // 5) We now have the exact column and row where the glyph's boundary starts, but our <canvas> is
    //    only 150x150 pixels (the higher the resolution, the longer it takes to iterate over all the
    //    pixels). Since our resolution is so low, the number we have is only a rough estimate. To
    //    improve it, repeat this entire process, except zoom in by 2 at the row and column we previ-
    //    ously computed.
    // 6) Each iteration of zooming in a more precise approximation of where the glyph actually be-
    //    gins. Repeat this until the approximation is sufficient (I chose seven iterations).
    // 7) To improve the performance slightly, after each iteration, check if the darkest pixel that
    //    we chose (where we would zoom in on for the next iteration) has an alpha level over 250/255.
    //    If it does, it implies that there is already a very distinct border and that zooming in more
    //    will not drastically increase precision. If we find such a pixel, cancel any more iterations
    //    and return the number we already have, since it is precise enough as is.
    // 8) Using this technique for all four sides of a glyph yields an approximate bounding box for
    //    the glyph that can be used to perform more calculations like the height, width, and depth.
  
    // All the values returned from these functions are in units of "em" to allow us to use them at
    // any font-size. In other words, if we get a visible width of "1", the glyph will be 1em wide at
    // any font-size.
    
    // These functions are computationally expensive. Making a single measurement on an empty glyph
    // requires us to iterate 22,500 times over every single pixel on the <canvas> (150x150). And
    // that's just for one measurement on one glyph. A typical FontTeX parsing will have many glyphs,
    // each with almost always more than one measurement to make. Even though we try to keep making
    // measurements to a minimum by only calling these functions when we actually need a certain dim-
    // ension, performing hundreds of measurements each time a piece of TeX code is (re-)rendered can
    // cause lag very quickly. To avoid that, measurements we make from these functions are stored in
    // a cache. Whenever we request a glyph's dimension that we have already done in the past, we just
    // return the cached value instead of re-analyzing everything. This makes rendering a piece of TeX
    // code the most expensive on the first call, and then any subsequent re-rendering of that same
    // code will already have cached values to make it re-render faster. In most cases, this isn't e-
    // ven really a problem the first time it gets rendered since computers are blazing fast, but it's
    // always nice to save as much computation power as you can with a cache.
  
    let fontDimen = {
      widthOf: function(string, family, style) {
        // This is the one function that does not use the measuring technique described above since it
        // returns the spacing that a glyph takes up. A "." or "|" character typically have very thin
        // glyphs, but the font designer (usually) adds spacing around them so that "..." doesn't just
        // look like three connected dots; they have spacing between them. This function, instead of
        // looking at a character's visible glyph, returns the width that the character takes up. For
        // a monospace font, all characters should have the same width, even if the glyphs themselves
        // have varying widths. A <canvas> has a convenient `measureText` method that returns our
        // exact value without us having to do any of the work ourselves.
  
        family = stripQuotes(family);
        style = ({
          nm: "",
          rm: "",
          sl: "oblique",
          it: "italic",
          bf: "bold"
        })[style || "nm"];
  
        // Return the cached value if one exists.
        if (this.cache[family] && this.cache[family][style] && this.cache[family][style][string] &&
          !isNaN(this.cache[family][style][string].width)) {
          return this.cache[family][style][string].width;
        }
  
        // Set the font to a relatively large font for better precision.
        this.context.font = `${style || ""} 500px ${family}`;
        // Make a new entry in the cache.
        this.cache[family] = this.cache[family] || {};
        this.cache[family][style] = this.cache[family][style] || {}
        this.cache[family][style][string] = this.cache[family][style][string] || {};
        // Measure the text and divide by 500 to get its value as a decimal in ems.
        return this.cache[family][style][string].width = this.context.measureText(string).width / 500;
      },
      visibleWidthOf: function(string, family, style) {
        // This function will return the width of a glyph. This is different from the `widthOf` func-
        // tion in that a "." will return a much smaller value than an "M", even in a monospace font,
        // because the period appears visually thinner. The leftmost and rightmost boundaries of the
        // glyph are found in that order, and the value returned is the difference between the two. A
        // glyph that is completely invisible (e.g. a space or tab character), 0 is returned since it
        // does not have a visible width.
  
        family = stripQuotes(family);
        style = ({
          nm: "",
          rm: "",
          sl: "oblique",
          it: "italic",
          bf: "bold"
        })[style || "nm"];
  
        if (this.cache[family] && this.cache[family][style] && this.cache[family][style][string] &&
            !isNaN(this.cache[family][style][string].vWidth)) {
          return this.cache[family][style][string].vWidth;
        }
  
        // A middle baseline is used so that the character will be placed in the center of
        // the canvas and (hopefully) all of it will be drawn and measured.
        this.context.textBaseline = "middle";
        this.context.textAlign = "center";
  
        function measureLeft(rectX, rectY, iteration) {
          // `rectX` and `rectY` indicate where the canvas should be zooming in, while `iteration` de-
          // termines the zoom level.
  
          if (iteration == 7) {
            return rectX;
          }
  
          // Before each iteration, the previous iteration's drawings need to be cleared.
          this.context.clearRect(0, 0, 150, 150);
  
          // Zoom level.
          let scale = Math.pow(2, iteration);
  
          this.context.font = `${style || ""} ${100 * scale}px ${family}`;
          this.context.fillText(
            string,
            75 + 150 * scale * (.5 - rectX),
            75 + 150 * scale * (.5 - rectY)
          );
  
          // Each pixel in each column is examined here. Since the character is rendered in black, the
          // RGB color channels don't matter; they'll always be 0. Only the alpha channel is what re-
          // ally determines whether the pixel is considered dark or not.
          let data = this.context.getImageData(0, 0, 150, 150).data;
          let foundCol = false;
          let row = 0;
          let col;
          let alpha;
  
          for (col = 0; col < 150; col++) {
            for (let i = 0; i < 150; i++) {
              alpha = data[col * 4 + 150 * 4 * i + 3];
  
              if (alpha > foundCol) {
                foundCol = alpha;
                row = i;
              }
            }
            if (foundCol) {
              break;
            }
          }
  
          // If no column was found and this is the first iteration, then no pixels were found (the
          // character is just whitespace). If that's the case, a special -1 is returned. After get-
          // ting a -1, the outer function will return 0 overall and skips over trying to measure the
          // character from the right side.
          if (foundCol === false && iteration == 0) {
            return -1;
          }
  
          // If alpha is already above 250, it's pretty much already 100% black (not exactly 100%, but
          // pretty close). If that's the case, it probably means zooming in won't solve any antiali-
          // asing issues since there's already a distinct boundary to the character. Instead of keep-
          // ing on with the iterations, it just ends here with the current measurement.
          if (alpha > 250) {
            return rectX + (col / 150 - .5) / Math.pow(2, iteration);
          }
  
          return measureLeft.call(
            this,
            rectX + (col / 150 - .5) / Math.pow(2, iteration),
            rectY + (row / 150 - .5) / Math.pow(2, iteration),
            iteration + 1
          );
        }
  
        let leftBound = measureLeft.call(this, .5, .5, 0);
        // If -1 was returned, it means no pixels were found at all and the visible width is 0.
        if (leftBound == -1) {
          this.cache[family] = this.cache[family] || {};
          this.cache[family][style] = this.cache[family][style] || {}
          this.cache[family][style][string] = this.cache[family][style][string] || {};
          return this.cache[family][style][string].vWidth = 0;
        }
  
        function measureRight(rectX, rectY, iteration) {
          // This is basically the same function as above except it'll start from the right
          // and works its way left to find the right boundary of a character. There's no
          // comments here because it's the almost same thing as above.
  
          if (iteration == 7) {
            return rectX;
          }
          this.context.clearRect(0, 0, 150, 150);
          let scale = Math.pow(2, iteration);
          this.context.font = `${style || ""} ${100 * scale}px ${family}`;
          this.context.fillText(string, 75 + 150 * scale * (.5 - rectX), 75 + 150 * scale * (.5 - rectY));
          let data = this.context.getImageData(0, 0, 150, 150).data;
          let foundCol = false;
          let row = 0;
          let col;
          let alpha;
  
          for (col = 149; col >= 0; col--) {
            for (let i = 0; i < 150; i++) {
              alpha = data[col * 4 + 150 * 4 * i + 3];
  
              if (alpha > foundCol) {
                foundCol = alpha;
                row = i;
              }
            }
            if (foundCol) {
              break;
            }
          }
          if (alpha > 250) return rectX + (col / 150 - .5) / Math.pow(2, iteration);
          return measureRight.call(this, rectX + (col / 150 - .5) / Math.pow(2, iteration), rectY + (row / 150 - .5) / Math.pow(2, iteration), iteration + 1);
        }
  
        let rightBound = measureRight.call(this, .5, .5, 0);
  
        // Now that both the left and right boundaries of a character have been found. The difference
        // between them is the visible width of the character. The numbers are both percentages though
        // of the width of the canvas (e.g. .25 and .75 mean the character takes up 50% of the can-
        // vas's width). The numbers need to be in terms of the character's original height (100px),
        // not the canvas's width (150px). To get there, the number is multiplied by 1.5 to get the
        // final value. That value should now be a ratio of a character's em height to its visible
        // width in ems. All that's left is to store the value in a cache (so that this whole process
        // doesn't need to be repeated each time the width is needed) and return the value.
  
        // The returned difference seems to be off by a tiny bit each time, possibly because of round-
        // ing errors or something. 0.01 is added to the final value to compensate.
  
        this.cache[family] = this.cache[family] || {};
        this.cache[family][style] = this.cache[family][style] || {};
        this.cache[family][style][string] = this.cache[family][style][string] || {};
        return this.cache[family][style][string].vWidth = (rightBound - leftBound) * 1.5 + .01;
      },
      heightOf: function(string, family, style) {
        // This function will return the height of a glyph, but specifically only the part above the
        // baseline (similar to how TeX would interpret the "height" of a character). In other words,
        // a character like "y" has about half of its total height below the baseline while only the
        // v-shaped part of the glyph remains above the baseline. This function will only return the
        // height of that v-shaped part that appears above the baseline. The `depthOf` function will
        // find the opposite; only the height of the part below the baseline. summing these two values
        // yields the total visible height of the character (actually, using the `trueDepthOf` func-
        // tion would be more accurate).
  
        family = stripQuotes(family);
        style = ({
          nm: "",
          rm: "",
          sl: "oblique",
          it: "italic",
          bf: "bold"
        })[style || "nm"];
  
        if (this.cache[family] && this.cache[family][style] && this.cache[family][style][string] &&
            !isNaN(this.cache[family][style][string].height)) {
          return this.cache[family][style][string].height;
        }
  
        // An alphabetic baseline aligns text to the normal baseline. The text is set at the very bot-
        // tom of the canvas so that only the part above the baseline is actually displayed. Then the
        // height is measured by going over each row sequentially just like what's done in the visible
        // width function.
        this.context.textBaseline = "alphabetic";
        this.context.textAlign = "center";
  
        function measure(rectX, rectY, iteration) {
          // The code below is almost thee same as the code from `visibleWidth' so look there
          // for comments.
  
          if (iteration == 7) {
            return rectY;
          }
          this.context.clearRect(0, 0, 150, 150);
          let scale = Math.pow(2, iteration);
          this.context.font = `${style || ""} ${100 * scale}px ${family}`;
          this.context.fillText(
            string,
            75 + 150 * scale * (.5 - rectX),
            75 + 150 * scale * (1 - rectY)
          );
          let data = this.context.getImageData(0, 0, 150, 150).data;
          let foundRow = false;
          let col = 0;
          let row;
          let alpha;
  
          for (row = 0; row < 150; row++) {
            for (let i = 0; i < 150; i++) {
              alpha = data[row * 4 * 150 + 4 * i + 3];
  
              if (alpha > foundRow) {
                foundRow = alpha;
                col = i;
              }
            }
            if (foundRow) {
              break;
            }
          }
          if (foundRow === false && iteration == 0) {
            return 1;
          }
          if (alpha > 250) {
            return rectY + (row / 150 - .5) / Math.pow(2, iteration);
          }
          return measure.call(
            this,
            rectX + (col / 150 - .5) / Math.pow(2, iteration),
            rectY + (row / 150 - .5) / Math.pow(2, iteration),
            iteration + 1
          );
        }
  
        this.cache[family] = this.cache[family] || {};
        this.cache[family][style] = this.cache[family][style] || {};
        this.cache[family][style][string] = this.cache[family][style][string] || {};
        return this.cache[family][style][string].height = (1 - measure.call(this, .5, .5, 0)) * 1.5;
      },
      depthOf: function(string, family, style) {
        // This function is similar to the `heightOf` function, except it returns the height of the
        // glyph visible below the baseline instead of above it. It is different from `trueDepthOf` in
        // that the value it returns will always be nonnegative. A character like "-" has none of its
        // glyph visible below the baseline, so its depth would be 0. But it actually starts a little
        // higher up than that even; about halfway up the line. The `trueDepthOf` function will return
        // a negative value for "-" to reflect this gap. For all glyphs with a nonnegative depth,
        // `depthOf` and `trueDepthOf` will return the same nonnegative number.
  
        family = stripQuotes(family);
        style = ({
          nm: "",
          rm: "",
          sl: "oblique",
          it: "italic",
          bf: "bold"
        })[style || "nm"];
  
        if (this.cache[family] && this.cache[family][style] && this.cache[family][style][string] &&
            !isNaN(this.cache[family][style][string].depth)) {
          return Math.max(0, this.cache[family][style][string].depth);
        }
  
        // An alphabetic baseline is used for the same reason as when the height was being
        // measured. The only difference is that the character being measured is placed at
        // the top of the canvas so that everything above the baseline is cut off.
        this.context.textBaseline = "alphabetic";
        this.context.textAlign = "center";
  
        function measure(rectX, rectY, iteration) {
          // The code below is almost the same as the code from `visibleWidth`.
  
          if (iteration == 7) {
            return rectY;
          }
          this.context.clearRect(0, 0, 150, 150);
          let scale = Math.pow(2, iteration);
          this.context.font = `${style || ""} ${100 * scale}px ${family}`;
          this.context.fillText(
            string,
            75 + 150 * scale * (.5 - rectX),
            75 + 150 * scale * (.5 - rectY)
          );
          let data = this.context.getImageData(0, 0, 150, 150).data;
          let foundRow = false;
          let col = 0;
          let row;
          let alpha;
  
          for (row = 149; row >= 0; row--) {
            for (let i = 0; i < 150; i++) {
              alpha = data[row * 4 * 150 + 4 * i + 3]
  
              if (alpha > foundRow) {
                foundRow = alpha;
                col = i;
              }
            }
            if (foundRow) {
              break;
            }
          }
          if (foundRow === false && iteration == 0) {
            return .5;
          }
          if (alpha > 250) {
            return rectY + (row / 150 - .5) / Math.pow(2, iteration);
          }
          return measure.call(
            this,
            rectX + (col / 150 - .5) / Math.pow(2, iteration),
            rectY + (row / 150 - .5) / Math.pow(2, iteration),
            iteration + 1
          );
        }
  
        this.cache[family] = this.cache[family] || {};
        this.cache[family][style] = this.cache[family][style] || {};
        this.cache[family][style][string] = this.cache[family][style][string] || {};
        return Math.max(
          0,
          this.cache[family][style][string].depth = (measure.call(this, .5, .5, 0) - .5) * 1.5
        );
      },
      trueDepthOf: function(string, family, style) {
        // The `trueDepthOf` function is similar to the `depthOf` function, except it can return nega-
        // tive values. Read the comment in `depthOf` for more details.
  
        // This relies directly on the `depthOf` function to find the depth the way it is normally
        // found. When that happens, `depthOf` will store the result in the cache to use for later,
        // but it will store its explicit value, not the zeroed-off value. This returns that explicit
        // value from the cache.
        this.depthOf(string, family, style);
        return this.cache[stripQuotes(family)][({
          nm: "",
          rm: "",
          sl: "oblique",
          it: "italic",
          bf: "bold"
        })[style || "nm"]][string].depth;
      },
      italCorrOf: function(string, family) {
        // The italic correction parameter for a glyph is found by finding how much of the glyph
        // exceeds past its bounding box on the right side when it is italicized. I think this is a
        // little different from the way TeX handles italic corrections, but it actually works out
        // really well with the way web fonts are handled. Since this dimension is only relevant for
        // an italicized glyph, a style argument is not necessary since all the glyphs it measures
        // will be italicized no matter what.
  
        family = stripQuotes(family);
  
        if (this.cache[family] && this.cache[family].italic && this.cache[family].italic[string] &&
            !isNaN(this.cache[family].italic[string].italCorr)) {
          return this.cache[family].italic[string].italCorr;
        }
  
        // It pretty much does the same thing as visible width except the character is aligned to the
        // left side of the canvas so that only the right part of the character is measured. After
        // that, the physical width is subtracted so that only the width of the part of the character
        // that exceeds the boundary box remains.
        this.context.textBaseline = "middle";
        this.context.textAlign = "left";
  
        function measure(rectX, rectY, iteration) {
          if (iteration == 7) {
            return rectX;
          }
          this.context.clearRect(0, 0, 150, 150);
          let scale = Math.pow(2, iteration);
          this.context.font = `italic ${100 * scale}px ${family}`;
          this.context.fillText(string, 75 + 150 * scale * -rectX, 75 + 150 * scale * (.5 - rectY));
          let data = this.context.getImageData(0, 0, 150, 150).data;
          let foundCol = false;
          let row = 0;
          let col;
          let alpha;
  
          for (col = 149; col >= 0; col--) {
            for (let i = 0; i < 150; i++) {
              alpha = data[col * 4 + 150 * 4 * i + 3];
              if (alpha > foundCol) {
                foundCol = alpha;
                row = i;
              }
            }
            if (foundCol) {
              break;
            }
          }
          if (foundCol === false && iteration == 0) {
            return 0;
          }
          if (alpha > 250) {
            return rectX + (col / 150 - .5) / Math.pow(2, iteration);
          }
          return measure.call(
            this,
            rectX + (col / 150 - .5) / Math.pow(2, iteration),
            rectY + (row / 150 - .5) / Math.pow(2, iteration),
            iteration + 1
          );
        }
  
        this.cache[family] = this.cache[family] || {};
        this.cache[family].italic = this.cache[family].italic || {};
        this.cache[family].italic[string] = this.cache[family].italic[string] || {};
        return this.cache[family].italic[string].italCorr = Math.max(
          0,
          measure.call(this, .5, .5, 0) * 1.5 - fontDimen.widthOf(string, family, "it")
        );
      },
      scriptOffsetOf: function(string, family, style) {
        // The `scriptOffsetOf` function is somewhat more complicated than the previous function be-
        // cause it actually measures the top half and bottom half of a glyph separately. A single-
        // character atom with a superscript and subscript will usually have a slight offset to the
        // superscript atom. Visit this link to see the difference in how the "p" is shifted over:
        // https://christianfigueroa.github.io/projects/fonttex/home?demotext=%24W_b%5Ep%24#demo
        // This results from the fact that "W" is slanted more at the top, which causes the "p" to
        // shift over more than the "b". Another prominent example is using \int; the superscript will
        // generally be more shifted over because of the integral's slant. That "amount to shift over"
        // is what this measures for a character: how much the top half of a glyph sticks out compared
        // to the bottom half. The two halves are measured as normal, and only their rightmost pixels
        // are used to calculate the offset.
  
        family = stripQuotes(family);
        style = ({
          nm: "",
          rm: "",
          sl: "oblique",
          it: "italic",
          bf: "bold"
        })[style || "nm"];
  
        if (this.cache[family] && this.cache[family][style] && this.cache[family][style][string] &&
            !isNaN(this.cache[family][style][string].scriptOffset)) {
          return this.cache[family][style][string].scriptOffset;
        }
  
        this.context.textBaseline = "middle";
        this.context.textAlign = "left";
  
        function measureTop(rectX, rectY, iteration) {
          if (iteration == 7) {
            return rectX;
          }
          this.context.clearRect(0, 0, 150, 150);
          let scale = Math.pow(2, iteration);
          this.context.font = `${style || ""} ${100 * scale}px ${family}`;
          this.context.fillText(
            string,
            75 + 150 * scale * (.5 - rectX),
            75 + 150 * scale * (.5 - rectY)
          );
          let data = this.context.getImageData(0, 0, 150, 150).data;
          let foundCol = false;
          let row = 0;
          let col;
          let alpha;
  
          for (col = 149; col >= 0; col--) {
            for (
              let i = 0;
              i < Math.max(150, Math.min(0, i < 75 + 150 * scale * (.5 - rectY)));
              i++
            ) {
              alpha = data[col * 4 + 150 * 4 * i + 3];
              if (alpha > foundCol) {
                foundCol = alpha;
                row = i;
              }
            }
            if (foundCol) {
              break;
            }
          }
          if (foundCol === false && iteration == 0) {
            return 0;
          }
          if (alpha > 250) {
            return rectX + (col / 150 - .5) / Math.pow(2, iteration);
          }
          return measureTop.call(
            this,
            rectX + (col / 150 - .5) / Math.pow(2, iteration),
            rectY + (row / 150 - .5) / Math.pow(2, iteration),
            iteration + 1
          );
        }
  
        function measureBottom(rectX, rectY, iteration) {
          if (iteration == 7) {
            return rectX;
          }
          this.context.clearRect(0, 0, 150, 150);
          let scale = Math.pow(2, iteration);
          this.context.font = `${style || ""} ${100 * scale}px ${family}`;
          this.context.fillText(
            string,
            75 + 150 * scale * (.5 - rectX),
            75 + 150 * scale * (.5 - rectY)
          );
          let data = this.context.getImageData(0, 0, 150, 150).data;
          let foundCol = false;
          let row = 0;
          let col;
          let alpha;
  
          for (col = 149; col >= 0; col--) {
            for (let i = 75; i < Math.max(150, i < 75 + 150 * scale * (1 - rectX)); i++) {
              alpha = data[col * 4 + 150 * 4 * i + 3];
              if (alpha > foundCol) {
                foundCol = alpha;
                row = i;
              }
            }
            if (foundCol) {
              break;
            }
          }
          if (foundCol === false && iteration == 0) {
            return 1;
          }
          if (alpha > 250) {
            return rectX + (col / 150 - .5) / Math.pow(2, iteration);
          }
          return measureBottom.call(
            this,
            rectX + (col / 150 - .5) / Math.pow(2, iteration),
            rectY + (row / 150 - .5) / Math.pow(2, iteration),
            iteration + 1
          );
        }
  
        let top = measureTop.call(this, .5, .5, 0);
        let bottom = measureBottom.call(this, .5, .5, 0);
  
        this.cache[family] = this.cache[family] || {};
        this.cache[family][style] = this.cache[family][style] || {};
        this.cache[family][style][string] = this.cache[family][style][string] || {};
        return this.cache[family][style][string].scriptOffset = Math.max(top - bottom, 0) * 1.5;
      },
      leftOffsetOf: function(string, family, style) {
        // This measures the amount of space from the left boundary of a character to where
        // the character actually begins. For example, an "f" in the "serif" browser font
        // has a tail that sticks out to the left. This function measures that distance.
        // This is only used for when a variable character (a-z, A-Z) is being placed (to
        // give characters like "f" a bit more room like in real TeX). It doesn't complete-
        // ly mirror the way real TeX does it, but it's somewhat accurate considering this
        // has to guess at a font's characteristics just by measuring it on a canvas. If it
        // really gets something wrong, there's always kerns to move characters around man-
        // ually.
  
        family = stripQuotes(family);
        style = ({
          nm: "",
          rm: "",
          sl: "oblique",
          it: "italic",
          bf: "bold"
        })[style || "nm"];
  
        if (this.cache[family] && this.cache[family][style] && this.cache[family][style][string] &&
            !isNaN(this.cache[family][style][string].leftOffset)) {
          return this.cache[family][style][string].leftOffset;
        }
  
        this.context.textBaseline = "middle";
        this.context.textAlign = "start";
  
        function measure(rectX, rectY, iteration) {
          if (iteration == 7) {
            return rectX;
          }
          this.context.clearRect(0, 0, 150, 150);
          let scale = Math.pow(2, iteration);
          this.context.font = `${style || ""} ${100 * scale}px ${family}`;
          this.context.fillText(
            string,
            75 + 150 * scale * (.5 - rectX),
            75 + 150 * scale * (.5 - rectY)
          );
          let data = this.context.getImageData(0, 0, 150, 150).data;
          let foundCol = false;
          let row = 0;
          let col;
          let alpha;
  
          for (col = 0; col < 150; col++) {
            for (let i = 0; i < 150; i++) {
              alpha = data[col * 4 + 150 * 4 * i + 3];
              if (alpha > foundCol) {
                foundCol = alpha;
                row = i;
              }
            }
            if (foundCol) {
              break;
            }
          }
  
          if (foundCol === false && iteration == 0) {
            return -1;
          }
          if (alpha > 250) {
            return rectX + (col / 150 - .5) / Math.pow(2, iteration);
          }
          return measure.call(
            this,
            rectX + (col / 150 - .5) / Math.pow(2, iteration),
            rectY + (row / 150 - .5) / Math.pow(2, iteration),
            iteration + 1
          );
        }
  
        this.cache[family] = this.cache[family] || {};
        this.cache[family][style] = this.cache[family][style] || {};
        this.cache[family][style][string] = this.cache[family][style][string] || {};
        return this.cache[family][style][string].leftOffset =
            (measure.call(this, .5, .5, 0) - .5) * -1.5;
      },
      baselineHeightOf: function(family) {
        // The `baselineHeightOf` function measures the distance from the bottom of a character's
        // total box to its baseline. This is different from a glyph's depth in that this does not
        // depend on the visual part of a glyph, it measures from the entire character's box. Since
        // a baseline height is generally the same for every character of a font (since, again, this
        // does not depend on any one glyph's visual appearances), only the font family is needed to
        // make the measurement.
  
        family = stripQuotes(family);
  
        if (this.cache[family] && !isNaN(this.cache[family].baseline)) {
          return this.cache[family].baseline;
        }
  
        this.context.textAlign = "center";
  
        function measureBottom(rectX, rectY, iteration) {
          this.context.textBaseline = "bottom";
          if (iteration == 7) {
            return rectY;
          }
          this.context.clearRect(0, 0, 150, 150);
          let scale = Math.pow(2, iteration);
          this.context.font = `${100 * scale}px ${family}`;
          this.context.fillText(
            "A",
            75 + 150 * scale * (.5 - rectX),
            75 + 150 * scale * (1 - rectY)
          );
          let data = this.context.getImageData(0, 0, 150, 150).data;
          let foundRow = false;
          let col = 0;
          let row;
          let alpha;
  
          for (row = 0; row < 150; row++) {
            for (let i = 0; i < 150; i++) {
              alpha = data[row * 4 * 150 + 4 * i + 3]
  
              if (alpha > foundRow) {
                foundRow = alpha;
                col = i;
              }
            }
            if (foundRow) {
              break;
            }
          }
          if (foundRow === false && iteration == 0) {
            return 1;
          }
          if (alpha > 250) {
            return rectY + (row / 150 - .5) / Math.pow(2, iteration);
          }
          return measureBottom.call(
            this,
            rectX + (col / 150 - .5) / Math.pow(2, iteration),
            rectY + (row / 150 - .5) / Math.pow(2, iteration),
            iteration + 1
          );
        }
  
        function measureBaseline(rectX, rectY, iteration) {
          this.context.textBaseline = "alphabetic";
          if (iteration == 7) {
            return rectY;
          }
          this.context.clearRect(0, 0, 150, 150);
          let scale = Math.pow(2, iteration);
          this.context.font = `${100 * scale}px ${family}`;
          this.context.fillText(
            "A",
            75 + 150 * scale * (.5 - rectX),
            75 + 150 * scale * (1 - rectY)
          );
          let data = this.context.getImageData(0, 0, 150, 150).data;
          let foundRow = false;
          let col = 0;
          let row;
          let alpha;
  
          for (row = 0; row < 150; row++) {
            for (let i = 0; i < 150; i++) {
              alpha = data[row * 4 * 150 + 4 * i + 3]
  
              if (alpha > foundRow) {
                foundRow = alpha;
                col = i;
              }
            }
            if (foundRow) {
              break;
            }
          }
          if (foundRow === false && iteration == 0) {
            return 1;
          }
          if (alpha > 250) {
            return rectY + (row / 150 - .5) / Math.pow(2, iteration);
          }
          return measureBaseline.call(
            this,
            rectX + (col / 150 - .5) / Math.pow(2, iteration),
            rectY + (row / 150 - .5) / Math.pow(2, iteration),
            iteration + 1
          );
        }
  
        this.cache[family] = this.cache[family] || {};
        return this.cache[family].baseline =
            (measureBaseline.call(this, .5, .5, 0) - measureBottom.call(this, .5, .5, 0)) * 1.5;
      },
      // The cache where old measurements are stored for faster access later.
      cache: {}
    };
  
    // A promise that checks that document.body has loaded.
    let bodyLoaded = new Promise(function(resolve, reject) {
      function check() {
        requestAnimationFrame(function() {
          if (document.body) {
            resolve(document.body);
          } else {
            check();
          }
        });
      }
      check();
    });
  
    bodyLoaded.then(function(body) {
      let canvas = document.createElement("canvas")
      canvas.style.position = "fixed";
      canvas.style.top = "100vh";
      canvas.style.left = "100vw";
      canvas.style.pointerEvents = "none";
      canvas.style.opacity = 0;
      canvas.width = 150;
      canvas.height = 150;
      fontDimen.canvas = canvas;
      fontDimen.context = canvas.getContext("2d");
      body.appendChild(canvas);
    });
  
    // This function checks when a font has loaded. The first argument is a CSS font stack separated
    // by commas (e.g. Roboto, "Roboto Slab", sans-serif). Whenever one of the fonts in the stack are
    // loaded, the callback is called, but only if none of the fonts before it in the stack have
    // loaded. For example, if the stack is Roboto, "Roboto Slab", sans-serif, all three fonts will
    // have a checker associated with them that checks if each individual font has loaded. If sans-
    // serif is the first to load, the callback will be called with the argument "sans-serif". If Ro-
    // boto loads next, the callback is called again because it comes earlier in the stack. If Roboto
    // Slab loads last, the callback has already been called for an earlier font (Roboto), so it is
    // not called again.
    let loadedFonts = [];
    function onFontLoad(fontStack, callback) {
      // Separate the font stack into a list of fonts.
      let fonts = fontStack.split(",").map(
        font => stripQuotes(font.trim())
      );
  
      // Keeps track of the earliest font in the stack that has loaded. Starts at Infinity since no
      // fonts are loaded yet. Each font that loads checks if its index is lower than `settled` to
      // check if a font before it has been called yet.
      let settled = Infinity;
  
      // Start trying the fonts from the beginning of the list.
      for (let i = 0, l = fonts.length; i < l; i++) {
        // Makes sure the fontLoader element has loaded.
        fontLoaderInit.then(function(elem) {
          function check(i) {
            // Request animation frame runs many times per second, each time checking for a font load.
            requestAnimationFrame(function() {
              // Check if the font has already been loaded. If it has, the callback is not called for
              // it again.
              if (loadedFonts.includes(fonts[i])) {
                if (i < settled) {
                  settled = i;
                }
                return;
              }
  
              // Try the font with a serif fallback.
              elem.style.fontFamily = `${fonts[i]}, serif`;
              // If the font is the same width as the serif font, it means the text is using serif,
              // not the intended font (i.e. it's not loaded yet).
              if (elem.offsetWidth != fontLoaderSerifWidth) {
                // Only run the callback if this font is the earliest in the stack to load.
                loadedFonts.push(fonts[i]);
  
                if (i < settled) {
                  settled = i;
                  callback(fonts[i]);
                }
                return;
              }
  
              // If it failed with a serif font, try again with sans-serif since there's a super small
              // but nonzero chance that the font has the same width as serif.
              elem.style.fontFamily = `${fonts[i]}, sans-serif`;
              if (elem.offsetWidth != fontLoaderSansWidth) {
                loadedFonts.push(fonts[i]);
                if (i < settled) {
                  settled = i;
                  callback(fonts[i]);
                }
                return;
              }
  
              // Both checks failed; schedule another check.
              check(i);
            });
          }
          check(this);
        }.bind(i));
      }
    };
  
    let fontLoaderSerifWidth;
    let fontLoaderSansWidth;
  
    // Initializes fontTeX.onFontLoad <canvas>.
    let fontLoaderInit = new Promise(function(resolve, reject) {
      bodyLoaded.then(function(body) {
        let fontLoaderChecker = document.createElement("div");
        fontLoaderChecker.style.visibility = "hidden";
        fontLoaderChecker.style.fontSize = "300px";
        fontLoaderChecker.style.position = "fixed";
        fontLoaderChecker.style.top = "100vh";
        fontLoaderChecker.style.left = "100vw";
        fontLoaderChecker.textContent = "This is a string that changes font.";
        body.appendChild(fontLoaderChecker);
        fontLoaderChecker.style.fontFamily = "serif";
        fontLoaderSerifWidth = fontLoaderChecker.offsetWidth;
        fontLoaderChecker.style.fontFamily = "sans-serif";
        fontLoaderSansWidth = fontLoaderChecker.offsetWidth;
        resolve(fontLoaderChecker);
      });
    });
  
    // Deletes the cache in fontDimen (useful when a new font has loaded and new measurements
    // need to be gotten).
    function clearFontCache(family, style) {
      // Strip quotes from `family` if there are any
      if (family) {
        family = stripQuotes(family);
      }
      if (family && !style) {
        // Delete only the cache associated with a certain family.
        delete fontDimen.cache[family];
      } else if (style && !family) {
        // Delete only the cache associated with a certain style.
        style = style.split(",").filter(str =>
          /^\\?(?:normalfont|nm|rm|it|sl|bf)$/.test(str.trim())
        ).map(str =>
          str.trim() == "\\normalfont" || str.trim() == "normalfont" ? "nm" :
              str.trim()[0] == "\\" ? str.trim().substring(1) :
              str.trim()
        );
        if (style.length) {
          for (let family in fontDimen.cache) {
            for (let i = style.length - 1; i >= 0; i--) {
              delete fontDimen.cache[family][i];
            }
          }
        }
      } else if (family && style) {
        // Delete only the style of a certain font.
        style = style.split(",").filter(str =>
          /^\\?(?:normalfont|nm|rm|it|sl|bf)$/.test(str.trim())
        ).map(str =>
          str.trim() == "\\normalfont" || str.trim() == "normalfont" ? "nm" :
              str.trim()[0] == "\\" ? str.trim().substring(1) :
              str.trim()
        );
        if (style.length && fontDimen.cache[family]) {
          for (let i = style.length - 1; i >= 0; i--) {
            delete fontDimen.cache[family][i];
          }
        }
      } else fontDimen.cache = {};
    }
  
    fontTeX._debug = {
      data: data,
      fontCache: fontDimen.cache,
      clearFontCache: clearFontCache,
      reset: function() {
        // Clears FontTeX's stored macros and registers so that only primitives are left.
        data.defs.macros = {};
        data.defs.active = {};
        data.registers.count = {};
        data.registers.dimen = {};
        data.registers.skip = {};
        data.registers.muskip = {};
        data.registers.named = {};
      }
    };
  
    return fontTeX;
  })();