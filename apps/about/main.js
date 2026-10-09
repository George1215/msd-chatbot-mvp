import { root, navigation, bindTheme } from "../shared/client.js";
import content from "./content.html?raw";
root.innerHTML = navigation() + content;
bindTheme();
