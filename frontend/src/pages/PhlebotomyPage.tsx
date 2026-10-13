import { useState } from "react";
import { PhlebotomistMobileView } from "../features/samples/PhlebotomistMobileView";
import { PhlebotomistLiveTracker } from "../features/logistics/PhlebotomistLiveTracker";

export const PhlebotomyPage = (): JSX.Element => {
  const [tab, setTab] = useState<"mobile" | "tracker">("mobile");

  return (
    <div>
      <div className="page-shell-align">
        <div className="dash-tabs phlebo-tabs">
        <button
          type="button"
          className={tab === "mobile" ? "dash-tab is-active" : "dash-tab"}
          onClick={() => setTab("mobile")}
        >
          Mobile PWA
        </button>
        <button
          type="button"
          className={tab === "tracker" ? "dash-tab is-active" : "dash-tab"}
          onClick={() => setTab("tracker")}
        >
          Live GPS map
        </button>
      </div>
      </div>
      {tab === "mobile" ? <PhlebotomistMobileView /> : <PhlebotomistLiveTracker />}
    </div>
  );
};
