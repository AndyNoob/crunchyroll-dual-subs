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

      return originalAnimate.call(this, keyframes, fixedOptions);
    }

    return originalAnimate.call(this, keyframes, options);
  };

  (Element.prototype.animate).__dualSubsPatched = true;
})();