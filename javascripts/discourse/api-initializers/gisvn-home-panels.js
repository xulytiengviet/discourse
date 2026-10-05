import { apiInitializer } from "discourse/lib/api";
import GisvnHomePanels from "../components/gisvn-home-panels";

export default apiInitializer((api) => {
  api.renderInOutlet("above-main-container", GisvnHomePanels);
});
