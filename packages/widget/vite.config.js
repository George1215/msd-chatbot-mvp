import { defineConfig } from "vite";
export default defineConfig({
  build:{
    lib:{
      entry:"src/widget.js",
      name:"ChatMsdWidget",
      formats:["es"],
      fileName:()=>"chat-msd-widget.js"
    }
  }
});
