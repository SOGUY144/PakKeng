import { Icon } from "../components/Icon";
import { RenderImg } from "../components/RenderImg";
import { GAME_NAME, POSITIONING, VALIDATION_NOTE } from "../data/copy";
import { hrefFor, navigate } from "../lib/router";
import "../styles/welcome.css";

/** The pond friends floating around the title (still renders of the real 3D models, no WebGL needed here). */
const FRIENDS = ["bird", "crab", "dog", "fish", "turtle"] as const;

/**
 * Welcome: one full-screen world, the app's name, one round "start" button.
 * Shown when the app is opened from its plain link; in-app "home" links and shared #/screen links skip it.
 */
export function WelcomeScreen() {
  return (
    <main className="welcome">
      <div className="welcome__sky" aria-hidden="true" />

      <header className="welcome__title">
        <h1>{GAME_NAME}</h1>
        <p>มาฝึกพูดกับเพื่อน ๆ กัน</p>
      </header>

      <div className="welcome__cast" aria-hidden="true">
        {FRIENDS.map((f) => (
          <span key={f} className={`welcome__friend welcome__friend--${f}`}>
            <RenderImg name={`hero-${f}`} fallback={<RenderImg name={`friend-${f}`} fallback={null} />} />
          </span>
        ))}
        <span className="welcome__hills" />
        <span className="welcome__bunny">
          <RenderImg name="hero-bunny" fallback={<RenderImg name="avatar-bunny" fallback={null} />} />
        </span>
      </div>

      <button type="button" className="welcome__go" onClick={() => navigate("home")} aria-label="เริ่มเลย ไปหน้าเลือกเกม">
        <Icon name="play" size={40} />
      </button>

      <footer className="welcome__foot">
        <p>
          <strong>{POSITIONING}</strong>
        </p>
        <p>{VALIDATION_NOTE}</p>
        <a href={hrefFor("dashboard")}>สำหรับครู</a>
      </footer>
    </main>
  );
}
