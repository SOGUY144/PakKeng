import { useEffect } from "react";
import { GAME_NAME } from "./data/copy";
import { Icon } from "./components/Icon";
import { ToastRegion } from "./components/Toast";
import { useActiveChild } from "./data/store";
import { navigate, useRoute, type Route } from "./lib/router";
import { BalloonScreen } from "./screens/BalloonScreen";
import { CalibrateScreen } from "./screens/CalibrateScreen";
import { DashboardScreen } from "./screens/DashboardScreen";
import { FrogScreen } from "./screens/FrogScreen";
import { GateScreen } from "./screens/GateScreen";
import { HomeScreen } from "./screens/HomeScreen";
import { ResultScreen } from "./screens/ResultScreen";
import { RunnerScreen } from "./screens/RunnerScreen";
import { WelcomeScreen } from "./screens/WelcomeScreen";

const TITLES: Record<Route, string> = {
  welcome: "ยินดีต้อนรับ",
  home: "หน้าหลัก",
  calibrate: "ปรับเครื่อง",
  runner: "กระต่ายวิ่ง",
  gate: "เปิดประตู",
  result: "สรุปรอบ",
  balloon: "บอลลูน",
  frog: "กบข้ามบึง",
  dashboard: "แดชบอร์ดนักแก้ไขการพูด",
};

/** A game the teacher has not enabled for this child cannot be opened by URL either. */
function Locked({ game }: { game: string }) {
  return (
    <div className="kid-screen">
      <div className="kid-frame kid-frame--page">
        <section className="card empty">
          <span className="empty__icon" aria-hidden="true">
            <Icon name="lock" size={28} />
          </span>
          <h1 className="empty__title">ครูยังไม่เปิด{game}</h1>
          <p>เกมนี้ยังไม่อยู่ในแผนการฝึกที่นักแก้ไขการพูดตั้งไว้ให้ ลองเล่นเกมในภารกิจวันนี้ก่อนนะ</p>
          <button type="button" className="btn btn--primary btn--lg btn--block" onClick={() => navigate("home")}>
            กลับหน้าหลัก
          </button>
        </section>
      </div>
    </div>
  );
}

function Screen({ route }: { route: Route }) {
  const plan = useActiveChild().plan;
  if (route === "runner" && !plan.games.runner) return <Locked game="เกมกระต่ายวิ่ง" />;
  if (route === "gate" && !plan.gateEnabled) return <Locked game="ด่านประตูเสียงนาสิก" />;
  if (route === "balloon" && !plan.games.balloon) return <Locked game="เกมบอลลูน" />;
  if (route === "frog" && !plan.games.frog) return <Locked game="เกมกบข้ามบึง" />;
  switch (route) {
    case "welcome":
      return <WelcomeScreen />;
    case "home":
      return <HomeScreen />;
    case "calibrate":
      return <CalibrateScreen />;
    case "runner":
      return <RunnerScreen />;
    case "gate":
      return <GateScreen />;
    case "result":
      return <ResultScreen />;
    case "balloon":
      return <BalloonScreen />;
    case "frog":
      return <FrogScreen />;
    case "dashboard":
      return <DashboardScreen />;
  }
}

export function App() {
  const route = useRoute();
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = `${TITLES[route]} · ${GAME_NAME}`;
  }, [route]);

  return (
    <>
      <div className={`app ${route === "dashboard" ? "app--teacher" : "app--kid"}`}>
        <Screen key={route} route={route} />
      </div>
      <ToastRegion />
    </>
  );
}
