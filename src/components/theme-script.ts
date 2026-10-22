// Runs before first paint (inlined in <head>) so the page never flashes the wrong theme. Kept out
// of the client module so the server layout receives the string itself, not a client reference.
export const THEME_KEY = "telltale:theme";

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(!t){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","light")}})();`;
