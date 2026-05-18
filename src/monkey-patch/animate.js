(() => {
  const originalAnimate = Element.prototype.animate;

  if ((originalAnimate).__dualSubsPatched) return;

  Element.prototype.animate = function (
    keyframes,
    options
) {
    if (options && typeof options === "object") {
      const fixedOptions = { ...options };

      if (
        typeof fixedOptions.easing == "string" &&
        (fixedOptions.easing.includes("NaN") || !CSS.supports("animation-timing-function", fixedOptions.easing))
      ) {
        console.warn("[dual-sub] fixed bad animation easing:", fixedOptions.easing);
        fixedOptions.easing = "linear";
      }

      if (typeof fixedOptions.duration == "number" && isNaN(fixedOptions.duration)) {
          console.warn("[dual-sub] fixed bad animation duration:", fixedOptions.duration);
          fixedOptions.duration = 0;
      }

      return originalAnimate.call(this, keyframes, fixedOptions);
    }

    return originalAnimate.call(this, keyframes, options);
  };

  (Element.prototype.animate).__dualSubsPatched = true;
  console.log("[dual-sub] patched animate", new Date());
})();