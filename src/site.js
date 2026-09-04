const menuButton = document.querySelector(".menu-toggle");
const navigation = document.querySelector(".site-navigation");

if (menuButton && navigation) {
  const closeMenu = ({ restoreFocus = false } = {}) => {
    menuButton.setAttribute("aria-expanded", "false");
    navigation.classList.remove("is-open");
    document.body.classList.remove("menu-open");
    if (restoreFocus) menuButton.focus();
  };

  const openMenu = () => {
    menuButton.setAttribute("aria-expanded", "true");
    navigation.classList.add("is-open");
    document.body.classList.add("menu-open");
    navigation.querySelector("a")?.focus();
  };

  menuButton.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    if (isOpen) closeMenu();
    else openMenu();
  });

  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) closeMenu();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && menuButton.getAttribute("aria-expanded") === "true") {
      closeMenu({ restoreFocus: true });
    }
  });

  document.addEventListener("click", (event) => {
    if (!navigation.contains(event.target) && !menuButton.contains(event.target)) {
      closeMenu();
    }
  });
}
