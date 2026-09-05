(function () {
  "use strict";

  const tabs = Array.from(document.querySelectorAll('.tabs [role="tab"]'));
  if (!tabs.length) return;

  function select(tab, focus) {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", on ? "true" : "false");
      t.tabIndex = on ? 0 : -1;
      const panel = document.getElementById(t.getAttribute("aria-controls"));
      if (panel) {
        panel.hidden = !on;
        if (on) {
          panel.style.animation = "none";
          void panel.offsetWidth;
          panel.style.animation = "";
        }
      }
    });
    if (focus) tab.focus();
    document.dispatchEvent(new CustomEvent("scene", { detail: tab.dataset.scene }));
  }

  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => select(tab, false));
    tab.addEventListener("keydown", (e) => {
      let next = null;
      if (e.key === "ArrowRight") next = tabs[(i + 1) % tabs.length];
      if (e.key === "ArrowLeft") next = tabs[(i - 1 + tabs.length) % tabs.length];
      if (e.key === "Home") next = tabs[0];
      if (e.key === "End") next = tabs[tabs.length - 1];
      if (next) {
        e.preventDefault();
        select(next, true);
      }
    });
  });
})();
