(function () {
  "use strict";

  // The script can arrive twice on one page (theme block + pasted form code);
  // the second copy only re-scans for new form hosts.
  if (window.__tclForms) {
    window.__tclForms.init();
    return;
  }

  var BASE = "/apps/forms/";
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var DOW = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function safeClass(value) {
    return String(value || "").replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
  }

  function safeColor(value) {
    return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(String(value || "")) ? value : "";
  }

  function safeUrl(value) {
    var url = String(value || "").trim();
    return /^(https?:\/\/|\/(?!\/))/i.test(url) ? url : "";
  }

  function px(n) {
    var num = Number(n);
    return (Number.isFinite(num) ? Math.max(0, Math.min(96, num)) : 0) + "px";
  }

  function box(b) {
    b = b || {};
    return px(b.top) + " " + px(b.right) + " " + px(b.bottom) + " " + px(b.left);
  }

  function hasPadding(spacing) {
    var p = (spacing && spacing.padding) || {};
    return ["top", "right", "bottom", "left"].some(function (side) { return Number(p[side]) > 0; });
  }

  // ─── Dates (mirrors app/forms/content.js) ──────────────────────────────────

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function parseIso(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));
    if (!m) return null;
    var y = +m[1], mo = +m[2], d = +m[3];
    var date = new Date(Date.UTC(y, mo - 1, d));
    if (date.getUTCFullYear() !== y || date.getUTCMonth() !== mo - 1 || date.getUTCDate() !== d) return null;
    return { year: y, month: mo, day: d };
  }

  function isoOf(date) { return date.toISOString().slice(0, 10); }

  function todayIso() {
    var now = new Date();
    return now.getFullYear() + "-" + pad(now.getMonth() + 1) + "-" + pad(now.getDate());
  }

  function addDays(iso, amount) {
    var p = parseIso(iso);
    return p ? isoOf(new Date(Date.UTC(p.year, p.month - 1, p.day + amount))) : iso;
  }

  function formatDate(iso, format) {
    var p = parseIso(iso);
    if (!p) return "";
    var name = MONTHS[p.month - 1];
    return String(format || "MM/DD/YYYY")
      .replace("YYYY", String(p.year))
      .replace("MMMM", "\u0001")
      .replace("MMM", "\u0002")
      .replace("MM", pad(p.month))
      .replace("DD", pad(p.day))
      .replace(/\bD\b/, String(p.day))
      .replace("\u0001", name)
      .replace("\u0002", name.slice(0, 3));
  }

  function dateAllowed(iso, o) {
    var p = parseIso(iso);
    if (!p) return false;
    if (o.minDate && iso < o.minDate) return false;
    if (o.maxDate && iso > o.maxDate) return false;
    if (o.disablePast && iso < todayIso()) return false;
    if (o.disableWeekends) {
      var wd = new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay();
      if (wd === 0 || wd === 6) return false;
    }
    return true;
  }

  var CAL_ICON = '<svg class="tclf-date__icon" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="4.5" width="14" height="12.5" rx="2"/><path d="M3 8.5h14M7 2.5v4M13 2.5v4" stroke-linecap="round"/></svg>';

  // Turns a .tclf-date wrapper into a calendar popover. The hidden input holds
  // the submitted YYYY-MM-DD value; the visible one shows the chosen format.
  function setupDatePicker(wrap, field) {
    var o = field.dateOptions || {};
    var weekStart = Number(o.weekStart) === 1 ? 1 : 0;
    var display = wrap.querySelector(".tclf-date__input");
    var hidden = wrap.querySelector('input[type="hidden"]');
    var cal = null;
    var view = null;
    var focused = null;

    function close() {
      if (!cal) return;
      cal.hidden = true;
      display.setAttribute("aria-expanded", "false");
      document.removeEventListener("mousedown", onOutside);
    }

    function onOutside(event) {
      if (!wrap.contains(event.target)) close();
    }

    function choose(iso) {
      hidden.value = iso;
      display.value = formatDate(iso, o.format);
      hidden.dispatchEvent(new Event("change", { bubbles: true }));
      close();
      display.focus();
    }

    function draw() {
      var first = new Date(Date.UTC(view.year, view.month - 1, 1));
      var offset = (first.getUTCDay() - weekStart + 7) % 7;
      var today = todayIso();
      var labels = DOW.slice(weekStart).concat(DOW.slice(0, weekStart));
      var html = '<div class="tclf-cal__head">' +
        '<button type="button" class="tclf-cal__nav" data-nav="-1" aria-label="Previous month">&#8249;</button>' +
        '<span class="tclf-cal__title" aria-live="polite">' + MONTHS[view.month - 1] + " " + view.year + "</span>" +
        '<button type="button" class="tclf-cal__nav" data-nav="1" aria-label="Next month">&#8250;</button></div>' +
        '<div class="tclf-cal__grid" role="grid">' +
        labels.map(function (l) { return '<span class="tclf-cal__dow" role="columnheader">' + l + "</span>"; }).join("");
      for (var i = 0; i < 42; i++) {
        var day = new Date(Date.UTC(view.year, view.month - 1, 1 - offset + i));
        var iso = isoOf(day);
        html += '<button type="button" role="gridcell" class="tclf-cal__day" data-iso="' + iso + '"' +
          (day.getUTCMonth() !== view.month - 1 ? " data-outside" : "") +
          (iso === today ? " data-today" : "") +
          ' aria-selected="' + (iso === hidden.value) + '"' +
          ' tabindex="' + (iso === focused ? "0" : "-1") + '"' +
          (dateAllowed(iso, o) ? "" : " disabled") + ">" + day.getUTCDate() + "</button>";
      }
      html += '</div><div class="tclf-cal__foot">' +
        '<button type="button" class="tclf-cal__link" data-act="clear">Clear</button>' +
        '<button type="button" class="tclf-cal__link" data-act="today"' + (dateAllowed(today, o) ? "" : " disabled") + ">Today</button></div>";
      cal.innerHTML = html;
    }

    function focusDay() {
      var node = cal.querySelector('[data-iso="' + focused + '"]');
      if (node) node.focus();
    }

    function show(iso) {
      var p = parseIso(iso);
      view = { year: p.year, month: p.month };
      draw();
      focusDay();
    }

    function open() {
      if (!cal) {
        cal = document.createElement("div");
        cal.className = "tclf-cal";
        cal.id = display.id + "-cal";
        cal.setAttribute("role", "dialog");
        cal.setAttribute("aria-label", "Choose a date");
        wrap.appendChild(cal);
        cal.addEventListener("click", function (event) {
          var target = event.target.closest("button");
          if (!target || target.disabled) return;
          if (target.hasAttribute("data-nav")) {
            var next = new Date(Date.UTC(view.year, view.month - 1 + Number(target.getAttribute("data-nav")), 1));
            view = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1 };
            draw();
          } else if (target.getAttribute("data-act") === "clear") {
            choose("");
          } else if (target.getAttribute("data-act") === "today") {
            choose(todayIso());
          } else if (target.hasAttribute("data-iso")) {
            choose(target.getAttribute("data-iso"));
          }
        });
        cal.addEventListener("keydown", function (event) {
          var moves = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
          if (moves[event.key]) {
            event.preventDefault();
            focused = addDays(focused, moves[event.key]);
            show(focused);
          } else if (event.key === "Escape") {
            event.preventDefault();
            close();
            display.focus();
          }
        });
      }
      focused = hidden.value || todayIso();
      cal.hidden = false;
      display.setAttribute("aria-expanded", "true");
      document.addEventListener("mousedown", onOutside);
      show(focused);
    }

    display.addEventListener("click", function () {
      if (cal && !cal.hidden) close();
      else open();
    });
    display.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " " || event.key === "ArrowDown") {
        event.preventDefault();
        open();
      }
    });
  }

  // ─── Fields ────────────────────────────────────────────────────────────────

  function richText(f) {
    // Rich text is allowlist-sanitized on the server (normalizeSchema) before
    // it is ever served, so it can be inserted as markup here.
    return f.richText || esc(f.label);
  }

  function imageBlock(f) {
    var img = f.image || {};
    var src = safeUrl(img.url);
    if (!src) return "";
    var justify = { left: "flex-start", right: "flex-end" }[img.align] || "center";
    var width = Math.max(10, Math.min(100, Number(img.width) || 100));
    var radius = Math.max(0, Math.min(60, Number(img.radius) || 0));
    var tag = '<img src="' + esc(src) + '" alt="' + esc(img.alt) + '" loading="lazy" style="width:' + width + "%;border-radius:" + radius + 'px">';
    var link = safeUrl(img.link);
    if (link) tag = '<a href="' + esc(link) + '" target="_blank" rel="noopener noreferrer" style="display:contents">' + tag + "</a>";
    return '<div class="tclf-image" style="justify-content:' + justify + '">' + tag + "</div>";
  }

  function control(f, uid) {
    var id = "tclf-" + uid + "-" + f.id;
    var name = esc(f.key || f.id);
    var req = f.required ? " required" : "";
    var star = f.required ? '<span class="tclf-required" aria-hidden="true"> *</span>' : "";
    var describedBy = f.helpText ? ' aria-describedby="' + id + '-help"' : "";
    var label = '<label class="tclf-label' + (f.hideLabel ? " tclf-sr-only" : "") + '" id="' + id + '-label" for="' + id + '">' + esc(f.label) + star + "</label>";
    var options = Array.isArray(f.options) ? f.options : [];
    var dv = f.defaultValue || "";
    var common = ' id="' + id + '" name="' + name + '"' + req + describedBy;

    switch (f.type) {
      case "heading":
        var level = ["h2", "h3", "h4"].indexOf(f.headingLevel) !== -1 ? f.headingLevel : "h3";
        return "<" + level + ' class="tclf-heading tclf-rich">' + richText(f) + "</" + level + ">";
      case "paragraph":
        return '<div class="tclf-paragraph tclf-rich">' + richText(f) + "</div>";
      case "image":
        return imageBlock(f);
      case "divider":
        return '<hr class="tclf-divider">';
      case "submitButton":
        return '<button type="submit" class="tclf-submit" data-button-style="' + esc(f.__buttonStyle) + '">' + esc(f.label || "Submit") + "</button>";
      case "hiddenField":
        return '<input type="hidden" name="' + name + '" value="' + esc(dv) + '">';
      case "longText":
        return label + "<textarea" + common + ' rows="4" placeholder="' + esc(f.placeholder) + '">' + esc(dv) + "</textarea>";
      case "dropdown":
        return label + "<select" + common + '><option value="">' + esc(f.placeholder || "Select…") + "</option>" +
          options.map(function (o) {
            return '<option value="' + esc(o) + '"' + (o === dv ? " selected" : "") + ">" + esc(o) + "</option>";
          }).join("") + "</select>";
      case "radio":
        return label.replace("<label", "<span").replace("</label>", "</span>").replace(/ for="[^"]*"/, "") +
          '<div class="tclf-choice-list" role="radiogroup" aria-labelledby="' + id + '-label">' +
          options.map(function (o) {
            return '<label class="tclf-choice"><input type="radio" name="' + name + '" value="' + esc(o) + '"' + (o === dv ? " checked" : "") + "><span>" + esc(o) + "</span></label>";
          }).join("") + "</div>";
      case "multiCheckbox":
        return label.replace("<label", "<span").replace("</label>", "</span>").replace(/ for="[^"]*"/, "") +
          '<div class="tclf-choice-list" role="group" aria-labelledby="' + id + '-label">' +
          options.map(function (o) {
            return '<label class="tclf-choice"><input type="checkbox" name="' + name + '[]" value="' + esc(o) + '"><span>' + esc(o) + "</span></label>";
          }).join("") + "</div>";
      case "checkbox":
      case "consentCheckbox":
        return '<label class="tclf-choice" for="' + id + '"><input type="checkbox"' + common + ' value="true"' + (dv === "true" ? " checked" : "") + "><span>" + esc(f.label) + star + "</span></label>";
      case "fileUpload":
        return label + '<input type="file"' + common + ">";
      case "date":
        var opts = f.dateOptions || {};
        var initial = parseIso(dv) ? dv : "";
        return label + '<div class="tclf-date" data-date-for="' + esc(f.id) + '">' +
          '<input type="text" class="tclf-date__input" id="' + id + '" readonly role="combobox" aria-controls="' + id + '-cal" aria-haspopup="dialog" aria-expanded="false"' + describedBy +
          ' placeholder="' + esc(f.placeholder || opts.format || "MM/DD/YYYY") + '" value="' + esc(formatDate(initial, opts.format)) + '">' +
          CAL_ICON + '<input type="hidden" name="' + name + '" value="' + esc(initial) + '"></div>';
      default:
        var t = { email: "email", phone: "tel", number: "number" }[f.type] || "text";
        return label + '<input type="' + t + '"' + common + ' placeholder="' + esc(f.placeholder) + '" value="' + esc(dv) + '">';
    }
  }

  // Mirrors columnProps() in app/components/forms/FormPreview.jsx.
  function colAttrs(f) {
    var block = f.blockStyle || {};
    var styles = [];
    var bg = safeColor(block.backgroundColor);
    var color = safeColor(block.textColor);
    var padded = hasPadding(f.spacing);
    if (f.spacing) {
      styles.push("margin:" + box(f.spacing.margin));
      if (padded || !bg) styles.push("padding:" + box(f.spacing.padding));
    }
    if (bg) styles.push("background:" + bg);
    if (color) styles.push("color:" + color);
    if (block.align && f.type !== "image" && ["left", "center", "right", "justify"].indexOf(block.align) !== -1) {
      styles.push("text-align:" + block.align);
    }
    return ' class="tclf-col' + (f.cssClass ? " " + safeClass(f.cssClass) : "") + '"' +
      ' data-width="' + esc(f.width || "full") + '" data-field-id="' + esc(f.id) + '"' +
      (bg ? " data-block-bg" : "") + (padded ? " data-has-padding" : "") +
      (styles.length ? ' style="' + styles.join(";") + '"' : "");
  }

  function sidePanel(side) {
    var img = safeUrl(side.imageUrl);
    return '<aside class="tclf-side" data-fit="' + (side.imageFit === "contain" ? "contain" : "cover") + '" data-valign="' + esc(side.verticalAlign || "center") + '">' +
      (img ? '<img class="tclf-side__img" src="' + esc(img) + '" alt="' + esc(side.imageAlt) + '">' : "") +
      // Sanitized server-side like field rich text.
      '<div class="tclf-side__content tclf-rich">' + (side.content || "") + "</div></aside>";
  }

  function readValues(form, fields) {
    var values = {};
    fields.forEach(function (f) {
      if (!f.key) return;
      var inputs = form.querySelectorAll('[name="' + CSS.escape(f.key) + '"], [name="' + CSS.escape(f.key + "[]") + '"]');
      var list = Array.prototype.slice.call(inputs);
      if (f.type === "multiCheckbox") {
        values[f.key] = list.filter(function (i) { return i.checked; }).map(function (i) { return i.value; });
      } else if (f.type === "checkbox" || f.type === "consentCheckbox") {
        values[f.key] = Boolean(list[0] && list[0].checked);
      } else if (f.type === "radio") {
        var picked = list.filter(function (i) { return i.checked; })[0];
        values[f.key] = picked ? picked.value : "";
      } else if (f.type === "fileUpload") {
        var file = list[0] && list[0].files && list[0].files[0];
        values[f.key] = file ? { name: file.name, size: file.size } : null;
      } else {
        values[f.key] = list[0] ? list[0].value : "";
      }
    });
    return values;
  }

  // Mirrors isConditionMet() in app/forms/fields.js so hidden fields match the server.
  function isAnswered(value) {
    if (Array.isArray(value)) return value.length > 0;
    if (value === true) return true;
    if (value === false || value == null) return false;
    return String(value).trim() !== "" && String(value) !== "false";
  }

  function conditionMet(field, fields, values) {
    var c = field.conditional;
    if (!c || !c.fieldId) return true;
    var source = null;
    for (var i = 0; i < fields.length; i++) if (fields[i].id === c.fieldId) source = fields[i];
    if (!source || !source.key) return true;
    var value = values[source.key];
    var expected = String(c.equals == null ? "" : c.equals).trim();
    if (!expected) return isAnswered(value);
    if (Array.isArray(value)) return value.map(String).indexOf(expected) !== -1;
    if (value === true) return ["true", "yes", "on", "checked"].indexOf(expected.toLowerCase()) !== -1;
    return String(value == null ? "" : value).trim().toLowerCase() === expected.toLowerCase();
  }

  function render(host, id, payload) {
    var form = payload.form;
    var schema = form.schema || {};
    var fields = Array.isArray(schema.fields) ? schema.fields : [];
    var settings = schema.settings || {};
    var style = form.desktopStyle || {};
    var uid = Math.random().toString(36).slice(2, 8);
    var twoColumn = settings.layout === "twoColumn";
    var side = settings.sidePanel || {};

    var card = document.createElement("div");
    card.className = "tclf-card tclf-form--" + safeClass(form.publicId) + (style.alignment === "center" ? " tclf-align-center" : "");
    card.setAttribute("data-input-style", style.inputStyle || "outline");
    card.setAttribute("data-layout", twoColumn ? "twoColumn" : "single");
    card.setAttribute("data-side-position", side.position === "right" ? "right" : "left");

    var styleTag = document.createElement("style");
    styleTag.textContent = payload.css || "";
    card.appendChild(styleTag);

    var layout = document.createElement("div");
    layout.className = "tclf-layout";
    layout.innerHTML = (twoColumn ? sidePanel(side) : "") + '<div class="tclf-main"></div>';
    card.appendChild(layout);

    var el = document.createElement("form");
    el.className = "tclf-grid";
    el.noValidate = true;

    var html = fields.map(function (f) {
      f.__buttonStyle = style.buttonStyle || "solid";
      var hidden = f.type === "hiddenField" ? " hidden" : "";
      var inner = control(f, uid);
      if (f.type === "image" && !inner) return "";
      return "<div" + colAttrs(f) + hidden + ">" +
        inner +
        (f.helpText && f.type !== "hiddenField" ? '<span class="tclf-help" id="tclf-' + uid + "-" + esc(f.id) + '-help">' + esc(f.helpText) + "</span>" : "") +
        (f.key ? '<span class="tclf-error" data-error-for="' + esc(f.key) + '" role="alert"></span>' : "") +
        "</div>";
    }).join("");

    if (settings.honeypotEnabled !== false) {
      html += '<div class="tclf-hp" aria-hidden="true"><label>Leave this empty<input type="text" name="__tclf_hp" tabindex="-1" autocomplete="off"></label></div>';
    }
    html += '<div class="tclf-form-error" role="alert" hidden></div>';
    el.innerHTML = html;
    layout.querySelector(".tclf-main").appendChild(el);
    host.replaceChildren(card);

    fields.forEach(function (f) {
      if (f.type !== "date") return;
      var wrap = el.querySelector('[data-date-for="' + CSS.escape(f.id) + '"]');
      if (wrap) setupDatePicker(wrap, f);
    });

    function applyConditions() {
      var values = readValues(el, fields);
      fields.forEach(function (f) {
        if (!f.conditional || !f.conditional.fieldId) return;
        var col = el.querySelector('[data-field-id="' + CSS.escape(f.id) + '"]');
        if (col) col.hidden = !conditionMet(f, fields, values);
      });
    }
    applyConditions();
    el.addEventListener("input", applyConditions);
    el.addEventListener("change", applyConditions);

    function clearErrors() {
      Array.prototype.forEach.call(el.querySelectorAll("[data-error-for]"), function (node) { node.textContent = ""; });
      Array.prototype.forEach.call(el.querySelectorAll("[aria-invalid]"), function (node) { node.removeAttribute("aria-invalid"); });
      var banner = el.querySelector(".tclf-form-error");
      banner.hidden = true;
      banner.textContent = "";
    }

    function showErrors(errors) {
      var first = null;
      Object.keys(errors || {}).forEach(function (key) {
        var slot = el.querySelector('[data-error-for="' + CSS.escape(key) + '"]');
        if (slot) slot.textContent = errors[key];
        var input = el.querySelector('[name="' + CSS.escape(key) + '"], [name="' + CSS.escape(key + "[]") + '"]');
        // Date pickers submit through a hidden input; flag the visible one.
        if (input && input.type === "hidden" && input.parentNode.classList.contains("tclf-date")) {
          input = input.parentNode.querySelector(".tclf-date__input");
        }
        if (input) {
          input.setAttribute("aria-invalid", "true");
          if (!first) first = input;
        }
      });
      if (first) first.focus();
    }

    function validateLocally(values) {
      var errors = {};
      fields.forEach(function (f) {
        if (!f.key || !f.required) return;
        var col = el.querySelector('[data-field-id="' + CSS.escape(f.id) + '"]');
        if (col && col.hidden && f.type !== "hiddenField") return;
        if (!isAnswered(values[f.key])) errors[f.key] = settings.errorRequired || "This field is required.";
      });
      return errors;
    }

    el.addEventListener("submit", function (event) {
      event.preventDefault();
      clearErrors();
      var values = readValues(el, fields);
      var local = validateLocally(values);
      if (Object.keys(local).length) {
        showErrors(local);
        return;
      }

      var button = el.querySelector(".tclf-submit");
      var originalText = button ? button.textContent : "";
      if (button) {
        button.disabled = true;
        button.textContent = settings.submitLoadingText || "Submitting…";
      }

      var honeypot = el.querySelector('[name="__tclf_hp"]');
      values.__tclf_hp = honeypot ? honeypot.value : "";
      values.__pageUrl = location.href;

      fetch(BASE + encodeURIComponent(id), {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(values),
      })
        .then(function (response) {
          return response.json().then(function (body) { return { ok: response.ok, body: body }; });
        })
        .then(function (result) {
          if (!result.ok || result.body.ok === false) {
            if (result.body.errors && Object.keys(result.body.errors).length) {
              showErrors(result.body.errors);
            } else {
              var banner = el.querySelector(".tclf-form-error");
              banner.textContent = result.body.error || settings.errorSubmit || "Something went wrong. Please try again.";
              banner.hidden = false;
            }
            return;
          }
          var redirect = String(settings.redirectUrl || "");
          if (settings.successMode === "redirect" && /^(https?:\/\/|\/)/i.test(redirect)) {
            window.location.assign(redirect);
            return;
          }
          el.innerHTML = '<div class="tclf-success" role="status">' + esc(result.body.message || settings.successMessage || "Thanks!") + "</div>";
        })
        .catch(function () {
          var banner = el.querySelector(".tclf-form-error");
          banner.textContent = settings.errorSubmit || "Something went wrong. Please try again.";
          banner.hidden = false;
        })
        .then(function () {
          if (button && button.isConnected) {
            button.disabled = false;
            button.textContent = originalText;
          }
        });
    });
  }

  function load(host) {
    var id = (host.getAttribute("data-tcl-form") || "").trim();
    if (!id || host.getAttribute("data-tcl-loaded")) return;
    host.setAttribute("data-tcl-loaded", "true");
    fetch(BASE + encodeURIComponent(id), { headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) throw new Error("unavailable");
        return response.json();
      })
      .then(function (payload) { render(host, id, payload); })
      .catch(function () {
        // Merchants see why in the theme editor; visitors just see nothing broken.
        host.textContent = window.Shopify && window.Shopify.designMode
          ? "This form isn't available. Check the form ID and make sure the form is published."
          : "";
      });
  }

  function init() {
    document.querySelectorAll("[data-tcl-form]").forEach(load);
  }

  window.__tclForms = { init: init };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  document.addEventListener("shopify:section:load", init);
  document.addEventListener("shopify:block:select", init);
})();
