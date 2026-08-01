export function getAutofillBootstrapScript(): string {
  return `(function(){
  if (window.__inixAutofillInstalled) return;
  window.__inixAutofillInstalled = true;
  if (!window.__inixAutofill) return;

  function findUsername(form, pwdInput) {
    var inputs = form ? Array.from(form.querySelectorAll('input')) : Array.from(document.querySelectorAll('input'));
    var textTypes = ['text', 'email', 'tel', ''];
    for (var i = 0; i < inputs.length; i++) {
      var inp = inputs[i];
      if (inp === pwdInput || inp.type === 'password' || inp.type === 'hidden') continue;
      if (textTypes.indexOf(inp.type) >= 0) {
        var name = (inp.name + inp.id + (inp.autocomplete || '')).toLowerCase();
        if (name.indexOf('user') >= 0 || name.indexOf('email') >= 0 || name.indexOf('login') >= 0 || inp.type === 'email') {
          return inp;
        }
      }
    }
    var pwdIdx = inputs.indexOf(pwdInput);
    for (var j = pwdIdx - 1; j >= 0; j--) {
      var candidate = inputs[j];
      if (['text','email','tel',''].indexOf(candidate.type) >= 0) return candidate;
    }
    return null;
  }

  function getFormCredentials(form) {
    var pwd = form.querySelector('input[type=password]');
    if (!pwd || !pwd.value) return null;
    var userInp = findUsername(form, pwd);
    var username = userInp && userInp.value ? userInp.value.trim() : '';
    if (!username || !pwd.value) return null;
    return { username: username, password: pwd.value };
  }

  document.addEventListener('submit', function(e) {
    var form = e.target;
    if (!form || form.tagName !== 'FORM') return;
    var creds = getFormCredentials(form);
    if (!creds) return;
    window.__inixAutofill.offerSave({
      origin: location.origin,
      username: creds.username,
      password: creds.password,
      title: document.title
    });
  }, true);

  var menuEl = null;
  function hideMenu() {
    if (menuEl) { menuEl.remove(); menuEl = null; }
  }

  function showCredentialMenu(pwdInput, creds) {
    hideMenu();
    if (!creds || creds.length === 0) return;
    menuEl = document.createElement('div');
    menuEl.setAttribute('data-inix-autofill', '1');
    menuEl.style.cssText = 'position:absolute;z-index:2147483647;background:#1a1a24;border:1px solid #444;border-radius:8px;padding:4px;min-width:200px;box-shadow:0 4px 12px rgba(0,0,0,0.5);font-family:system-ui;font-size:13px;color:#eee;';
    for (var k = 0; k < creds.length; k++) {
      (function(c) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = c.username;
        btn.style.cssText = 'display:block;width:100%;text-align:left;padding:8px 12px;border:none;background:transparent;color:inherit;cursor:pointer;border-radius:4px;';
        btn.onmouseenter = function() { btn.style.background = '#2a2a3a'; };
        btn.onmouseleave = function() { btn.style.background = 'transparent'; };
        btn.onclick = function() {
          window.__inixAutofill.getPassword(c.id).then(function(password) {
            if (!password) return;
            pwdInput.value = password;
            pwdInput.dispatchEvent(new Event('input', { bubbles: true }));
            var form = pwdInput.closest('form');
            var userInp = form ? findUsername(form, pwdInput) : null;
            if (userInp) {
              userInp.value = c.username;
              userInp.dispatchEvent(new Event('input', { bubbles: true }));
            }
            hideMenu();
          });
        };
        menuEl.appendChild(btn);
      })(creds[k]);
    }
    var rect = pwdInput.getBoundingClientRect();
    menuEl.style.top = (rect.bottom + window.scrollY + 4) + 'px';
    menuEl.style.left = (rect.left + window.scrollX) + 'px';
    document.body.appendChild(menuEl);
    setTimeout(function() {
      document.addEventListener('click', function(ev) {
        if (menuEl && !menuEl.contains(ev.target)) hideMenu();
      }, { once: true });
    }, 0);
  }

  document.addEventListener('focusin', function(e) {
    var t = e.target;
    if (t && t.tagName === 'INPUT' && t.type === 'password') {
      window.__inixAutofill.getCredentials(location.origin).then(function(creds) {
        showCredentialMenu(t, creds);
      });
    }
  });

  function fieldHint(input) {
    return ((input.name || '') + (input.id || '') + (input.autocomplete || '')).toLowerCase();
  }

  function fillIfEmpty(input, value) {
    if (!value || input.value) return;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  document.addEventListener('focusin', function(e) {
    var t = e.target;
    if (!t || t.tagName !== 'INPUT' || t.type === 'password' || t.type === 'hidden') return;
    var hint = fieldHint(t);
    if (!hint.match(/name|email|address|city|zip|postal|phone|tel|card|country|state/)) return;
    window.__inixAutofill.getProfiles().then(function(profiles) {
      if (!profiles || profiles.length === 0) return;
      var def = profiles.find(function(p) { return p.is_default; }) || profiles[0];
      return window.__inixAutofill.getProfileData(def.id);
    }).then(function(data) {
      if (!data) return;
      if (hint.indexOf('email') >= 0) fillIfEmpty(t, data.email);
      else if (hint.indexOf('phone') >= 0 || hint.indexOf('tel') >= 0) fillIfEmpty(t, data.phone);
      else if (hint.indexOf('address') >= 0 && hint.indexOf('2') < 0) fillIfEmpty(t, data.addressLine1);
      else if (hint.indexOf('address') >= 0) fillIfEmpty(t, data.addressLine2);
      else if (hint.indexOf('city') >= 0) fillIfEmpty(t, data.city);
      else if (hint.indexOf('state') >= 0) fillIfEmpty(t, data.state);
      else if (hint.indexOf('zip') >= 0 || hint.indexOf('postal') >= 0) fillIfEmpty(t, data.postalCode);
      else if (hint.indexOf('country') >= 0) fillIfEmpty(t, data.country);
      else if (hint.indexOf('card') >= 0 && hint.indexOf('name') >= 0) fillIfEmpty(t, data.cardName);
      else if (hint.indexOf('card') >= 0 && hint.indexOf('exp') >= 0) fillIfEmpty(t, data.cardExpiry);
      else if (hint.indexOf('cvc') >= 0 || hint.indexOf('cvv') >= 0) fillIfEmpty(t, data.cardCvc);
      else if (hint.indexOf('name') >= 0 && hint.indexOf('user') < 0) fillIfEmpty(t, data.fullName);
    });
  });
})();`;
}
