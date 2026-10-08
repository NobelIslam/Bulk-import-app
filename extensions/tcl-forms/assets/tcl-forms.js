(function () {
  "use strict";

  var BASE = "/apps/forms/";

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function safeClass(value) {
    return String(value || "").replace(/[^a-zA-Z0-9_\- ]/g, "").trim();
  }

  function px(n) {
    var num = Number(n);
    return (Number.isFinite(num) ? Math.max(0, Math.min(96, num)) : 0) + "px";
  }

  function box(b) {
    b = b || {};
    return px(b.top) + " " + px(b.right) + " " + px(b.bottom) + " " + px(b.left);
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
        return '<h3 class="tclf-heading">' + esc(f.label) + "</h3>";
      case "paragraph":
        return '<p class="tclf-paragraph">' + esc(f.label) + "</p>";
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
      default:
        var t = { email: "email", phone: "tel", number: "number", date: "date" }[f.type] || "text";
        return label + '<input type="' + t + '"' + common + ' placeholder="' + esc(f.placeholder) + '" value="' + esc(dv) + '">';
    }
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

  function render(host, id, payload) {
    var form = payload.form;
    var schema = form.schema || {};
    var fields = Array.isArray(schema.fields) ? schema.fields : [];
    var settings = schema.settings || {};
    var style = form.desktopStyle || {};
    var uid = Math.random().toString(36).slice(2, 8);

    var card = document.createElement("div");
    card.className = "tclf-card tclf-form--" + safeClass(form.publicId) + (style.alignment === "center" ? " tclf-align-center" : "");
    card.setAttribute("data-input-style", style.inputStyle || "outline");

    var styleTag = document.createElement("style");
    styleTag.textContent = payload.css || "";
    card.appendChild(styleTag);

    var el = document.createElement("form");
    el.className = "tclf-grid";
    el.noValidate = true;

    var html = fields.map(function (f) {
      f.__buttonStyle = style.buttonStyle || "solid";
      var cls = "tclf-col" + (f.cssClass ? " " + safeClass(f.cssClass) : "");
      var spacing = f.spacing ? ' style="margin:' + box(f.spacing.margin) + ";padding:" + box(f.spacing.padding) + '"' : "";
      var hidden = f.type === "hiddenField" ? " hidden" : "";
      return '<div class="' + cls + '" data-width="' + esc(f.width || "full") + '" data-field-id="' + esc(f.id) + '"' + spacing + hidden + ">" +
        control(f, uid) +
        (f.helpText && f.type !== "hiddenField" ? '<span class="tclf-help" id="tclf-' + uid + "-" + esc(f.id) + '-help">' + esc(f.helpText) + "</span>" : "") +
        (f.key ? '<span class="tclf-error" data-error-for="' + esc(f.key) + '" role="alert"></span>' : "") +
        "</div>";
    }).join("");

    if (settings.honeypotEnabled !== false) {
      html += '<div class="tclf-hp" aria-hidden="true"><label>Leave this empty<input type="text" name="__tclf_hp" tabindex="-1" autocomplete="off"></label></div>';
    }
    html += '<div class="tclf-form-error" role="alert" hidden></div>';
    el.innerHTML = html;
    card.appendChild(el);
    host.replaceChildren(card);

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
    var id = host.getAttribute("data-tcl-form");
    if (!id || host.getAttribute("data-tcl-loaded")) return;
    host.setAttribute("data-tcl-loaded", "true");
    fetch(BASE + encodeURIComponent(id), { headers: { Accept: "application/json" } })
      .then(function (response) {
        if (!response.ok) throw new Error("unavailable");
        return response.json();
      })
      .then(function (payload) { render(host, id, payload); })
      .catch(function () { host.textContent = "This form is currently unavailable."; });
  }

  function init() {
    document.querySelectorAll("[data-tcl-form]").forEach(load);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
  document.addEventListener("shopify:section:load", init);
})();
