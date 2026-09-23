import { useApp } from "../../lib/app";
import { IconChevronDown, IconClose, IconGit, IconMaximise, IconMinus, IconProject, IconSearch } from "../ui/icons";
import { Kbd } from "../ui";
import * as api from "../../../wailsjs/go/main/App";

/** Frameless chrome: drag region, project switcher, palette hint, window buttons. */
export function TitleBar() {
  const { project, setPalette, go } = useApp();

  return (
    <header className="titlebar">
      <div className="titlebar__brand">
        <span className="titlebar__mark" />
        deck
      </div>

      <button className="project-chip" onClick={() => setPalette(true)} title="Switch project">
        {project ? <IconGit size={12} /> : <IconProject size={12} />}
        <span className="truncate">{project ? project.name : "No project"}</span>
        {project?.git?.branch && <span className="project-chip__branch">{project.git.branch}</span>}
        <IconChevronDown size={11} style={{ opacity: 0.6 }} />
      </button>

      <div className="titlebar__centre">
        <button className="cmdk-hint" onClick={() => setPalette(true)}>
          <IconSearch size={12} />
          <span>Search or run a command</span>
          <span className="spacer" />
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </button>
      </div>

      <div className="titlebar__win">
        <button onClick={() => api.Minimise()} aria-label="Minimise"><IconMinus size={13} /></button>
        <button onClick={() => api.ToggleMaximise()} aria-label="Maximise"><IconMaximise size={11} /></button>
        <button className="close" onClick={() => { go("dashboard"); api.Quit(); }} aria-label="Close"><IconClose size={13} /></button>
      </div>
    </header>
  );
}
