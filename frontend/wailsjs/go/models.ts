export namespace logs {
	
	export class Source {
	    id: string;
	    label: string;
	    kind: string;
	    target: string;
	    dir: string;
	
	    static createFrom(source: any = {}) {
	        return new Source(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.kind = source["kind"];
	        this.target = source["target"];
	        this.dir = source["dir"];
	    }
	}

}

export namespace main {
	
	export class Geometry {
	    x: number;
	    y: number;
	    w: number;
	    h: number;
	
	    static createFrom(source: any = {}) {
	        return new Geometry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.x = source["x"];
	        this.y = source["y"];
	        this.w = source["w"];
	        this.h = source["h"];
	    }
	}
	export class ProjectState {
	    project?: project.Project;
	    processes: proc.Info[];
	    ports: netinfo.Conn[];
	    cpu: number;
	    memory: number;
	
	    static createFrom(source: any = {}) {
	        return new ProjectState(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.project = this.convertValues(source["project"], project.Project);
	        this.processes = this.convertValues(source["processes"], proc.Info);
	        this.ports = this.convertValues(source["ports"], netinfo.Conn);
	        this.cpu = source["cpu"];
	        this.memory = source["memory"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Settings {
	    theme: string;
	    pollInterval: number;
	    accent: string;
	    density: string;
	    cpuMode: string;
	    tempUnit: string;
	    recentProjects: string[];
	    activeProject: string;
	    confirmKill: boolean;
	    showSystemProcs: boolean;
	    startPage: string;
	
	    static createFrom(source: any = {}) {
	        return new Settings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.theme = source["theme"];
	        this.pollInterval = source["pollInterval"];
	        this.accent = source["accent"];
	        this.density = source["density"];
	        this.cpuMode = source["cpuMode"];
	        this.tempUnit = source["tempUnit"];
	        this.recentProjects = source["recentProjects"];
	        this.activeProject = source["activeProject"];
	        this.confirmKill = source["confirmKill"];
	        this.showSystemProcs = source["showSystemProcs"];
	        this.startPage = source["startPage"];
	    }
	}

}

export namespace netinfo {
	
	export class Conn {
	    proto: string;
	    local: string;
	    port: number;
	    remote: string;
	    remotePort: number;
	    state: string;
	    pid: number;
	    process: string;
	    cmd: string;
	    user: string;
	    label: string;
	    cwd: string;
	
	    static createFrom(source: any = {}) {
	        return new Conn(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.proto = source["proto"];
	        this.local = source["local"];
	        this.port = source["port"];
	        this.remote = source["remote"];
	        this.remotePort = source["remotePort"];
	        this.state = source["state"];
	        this.pid = source["pid"];
	        this.process = source["process"];
	        this.cmd = source["cmd"];
	        this.user = source["user"];
	        this.label = source["label"];
	        this.cwd = source["cwd"];
	    }
	}

}

export namespace proc {
	
	export class Info {
	    pid: number;
	    ppid: number;
	    name: string;
	    cmdline: string;
	    user: string;
	    state: string;
	    cpu: number;
	    memRss: number;
	    memPercent: number;
	    threads: number;
	    startTime: number;
	    kind: string;
	
	    static createFrom(source: any = {}) {
	        return new Info(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pid = source["pid"];
	        this.ppid = source["ppid"];
	        this.name = source["name"];
	        this.cmdline = source["cmdline"];
	        this.user = source["user"];
	        this.state = source["state"];
	        this.cpu = source["cpu"];
	        this.memRss = source["memRss"];
	        this.memPercent = source["memPercent"];
	        this.threads = source["threads"];
	        this.startTime = source["startTime"];
	        this.kind = source["kind"];
	    }
	}
	export class Detail {
	    pid: number;
	    ppid: number;
	    name: string;
	    cmdline: string;
	    user: string;
	    state: string;
	    cpu: number;
	    memRss: number;
	    memPercent: number;
	    threads: number;
	    startTime: number;
	    kind: string;
	    exe: string;
	    cwd: string;
	    nice: number;
	    openFds: number;
	    env: string[];
	    children: Info[];
	    readBytes: number;
	    writeBytes: number;
	
	    static createFrom(source: any = {}) {
	        return new Detail(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.pid = source["pid"];
	        this.ppid = source["ppid"];
	        this.name = source["name"];
	        this.cmdline = source["cmdline"];
	        this.user = source["user"];
	        this.state = source["state"];
	        this.cpu = source["cpu"];
	        this.memRss = source["memRss"];
	        this.memPercent = source["memPercent"];
	        this.threads = source["threads"];
	        this.startTime = source["startTime"];
	        this.kind = source["kind"];
	        this.exe = source["exe"];
	        this.cwd = source["cwd"];
	        this.nice = source["nice"];
	        this.openFds = source["openFds"];
	        this.env = source["env"];
	        this.children = this.convertValues(source["children"], Info);
	        this.readBytes = source["readBytes"];
	        this.writeBytes = source["writeBytes"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace project {
	
	export class Git {
	    branch: string;
	    modified: number;
	    staged: number;
	    untracked: number;
	    ahead: number;
	    behind: number;
	    remote: string;
	    commit: string;
	    message: string;
	    author: string;
	    when: number;
	    clean: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Git(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.branch = source["branch"];
	        this.modified = source["modified"];
	        this.staged = source["staged"];
	        this.untracked = source["untracked"];
	        this.ahead = source["ahead"];
	        this.behind = source["behind"];
	        this.remote = source["remote"];
	        this.commit = source["commit"];
	        this.message = source["message"];
	        this.author = source["author"];
	        this.when = source["when"];
	        this.clean = source["clean"];
	    }
	}
	export class Script {
	    name: string;
	    command: string;
	    source: string;
	    role: string;
	
	    static createFrom(source: any = {}) {
	        return new Script(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.command = source["command"];
	        this.source = source["source"];
	        this.role = source["role"];
	    }
	}
	export class Project {
	    name: string;
	    path: string;
	    git?: Git;
	    stack: string[];
	    scripts: Script[];
	    opened: number;
	
	    static createFrom(source: any = {}) {
	        return new Project(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.git = this.convertValues(source["git"], Git);
	        this.stack = source["stack"];
	        this.scripts = this.convertValues(source["scripts"], Script);
	        this.opened = source["opened"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace services {
	
	export class Service {
	    id: string;
	    name: string;
	    kind: string;
	    source: string;
	    status: string;
	    detail: string;
	    pid: number;
	    ports: number[];
	    uptime: string;
	    managed: boolean;
	    enabled: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Service(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.kind = source["kind"];
	        this.source = source["source"];
	        this.status = source["status"];
	        this.detail = source["detail"];
	        this.pid = source["pid"];
	        this.ports = source["ports"];
	        this.uptime = source["uptime"];
	        this.managed = source["managed"];
	        this.enabled = source["enabled"];
	    }
	}

}

export namespace storage {
	
	export class Entry {
	    name: string;
	    path: string;
	    size: number;
	    isDir: boolean;
	    items: number;
	    kind: string;
	    percent: number;
	    modTime: number;
	
	    static createFrom(source: any = {}) {
	        return new Entry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.path = source["path"];
	        this.size = source["size"];
	        this.isDir = source["isDir"];
	        this.items = source["items"];
	        this.kind = source["kind"];
	        this.percent = source["percent"];
	        this.modTime = source["modTime"];
	    }
	}
	export class ScanResult {
	    path: string;
	    parent: string;
	    total: number;
	    items: number;
	    entries: Entry[];
	    largest: Entry[];
	    reclaimable: number;
	    truncated: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ScanResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.parent = source["parent"];
	        this.total = source["total"];
	        this.items = source["items"];
	        this.entries = this.convertValues(source["entries"], Entry);
	        this.largest = this.convertValues(source["largest"], Entry);
	        this.reclaimable = source["reclaimable"];
	        this.truncated = source["truncated"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace system {
	
	export class CPUStat {
	    usage: number;
	    perCore: number[];
	    load1: number;
	    load5: number;
	    load15: number;
	    cores: number;
	    threads: number;
	    freq: number;
	    procs: number;
	    threadCount: number;
	
	    static createFrom(source: any = {}) {
	        return new CPUStat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.usage = source["usage"];
	        this.perCore = source["perCore"];
	        this.load1 = source["load1"];
	        this.load5 = source["load5"];
	        this.load15 = source["load15"];
	        this.cores = source["cores"];
	        this.threads = source["threads"];
	        this.freq = source["freq"];
	        this.procs = source["procs"];
	        this.threadCount = source["threadCount"];
	    }
	}
	export class DiskStat {
	    device: string;
	    mount: string;
	    fstype: string;
	    total: number;
	    used: number;
	    free: number;
	    percent: number;
	    readRate: number;
	    writeRate: number;
	    isInternal: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DiskStat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.device = source["device"];
	        this.mount = source["mount"];
	        this.fstype = source["fstype"];
	        this.total = source["total"];
	        this.used = source["used"];
	        this.free = source["free"];
	        this.percent = source["percent"];
	        this.readRate = source["readRate"];
	        this.writeRate = source["writeRate"];
	        this.isInternal = source["isInternal"];
	    }
	}
	export class GPUStat {
	    name: string;
	    usage: number;
	    memUsed: number;
	    memTotal: number;
	    temp: number;
	    power: number;
	    vendor: string;
	
	    static createFrom(source: any = {}) {
	        return new GPUStat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.usage = source["usage"];
	        this.memUsed = source["memUsed"];
	        this.memTotal = source["memTotal"];
	        this.temp = source["temp"];
	        this.power = source["power"];
	        this.vendor = source["vendor"];
	    }
	}
	export class HostInfo {
	    hostname: string;
	    platform: string;
	    version: string;
	    kernel: string;
	    arch: string;
	    cpuModel: string;
	    cores: number;
	    threads: number;
	    memTotal: number;
	    bootTime: number;
	    user: string;
	    shell: string;
	    home: string;
	    goVersion: string;
	
	    static createFrom(source: any = {}) {
	        return new HostInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.hostname = source["hostname"];
	        this.platform = source["platform"];
	        this.version = source["version"];
	        this.kernel = source["kernel"];
	        this.arch = source["arch"];
	        this.cpuModel = source["cpuModel"];
	        this.cores = source["cores"];
	        this.threads = source["threads"];
	        this.memTotal = source["memTotal"];
	        this.bootTime = source["bootTime"];
	        this.user = source["user"];
	        this.shell = source["shell"];
	        this.home = source["home"];
	        this.goVersion = source["goVersion"];
	    }
	}
	export class IOStat {
	    readRate: number;
	    writeRate: number;
	
	    static createFrom(source: any = {}) {
	        return new IOStat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.readRate = source["readRate"];
	        this.writeRate = source["writeRate"];
	    }
	}
	export class InterfaceStat {
	    name: string;
	    rxRate: number;
	    txRate: number;
	    rxTotal: number;
	    txTotal: number;
	    up: boolean;
	    addr: string;
	
	    static createFrom(source: any = {}) {
	        return new InterfaceStat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.rxRate = source["rxRate"];
	        this.txRate = source["txRate"];
	        this.rxTotal = source["rxTotal"];
	        this.txTotal = source["txTotal"];
	        this.up = source["up"];
	        this.addr = source["addr"];
	    }
	}
	export class MemStat {
	    total: number;
	    used: number;
	    free: number;
	    available: number;
	    cached: number;
	    percent: number;
	
	    static createFrom(source: any = {}) {
	        return new MemStat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total = source["total"];
	        this.used = source["used"];
	        this.free = source["free"];
	        this.available = source["available"];
	        this.cached = source["cached"];
	        this.percent = source["percent"];
	    }
	}
	export class NetStat {
	    rxRate: number;
	    txRate: number;
	    rxTotal: number;
	    txTotal: number;
	    interfaces: InterfaceStat[];
	
	    static createFrom(source: any = {}) {
	        return new NetStat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.rxRate = source["rxRate"];
	        this.txRate = source["txRate"];
	        this.rxTotal = source["rxTotal"];
	        this.txTotal = source["txTotal"];
	        this.interfaces = this.convertValues(source["interfaces"], InterfaceStat);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class TempStat {
	    label: string;
	    value: number;
	    high: number;
	
	    static createFrom(source: any = {}) {
	        return new TempStat(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.label = source["label"];
	        this.value = source["value"];
	        this.high = source["high"];
	    }
	}
	export class Snapshot {
	    time: number;
	    cpu: CPUStat;
	    memory: MemStat;
	    swap: MemStat;
	    disks: DiskStat[];
	    diskIO: IOStat;
	    network: NetStat;
	    temps: TempStat[];
	    gpus: GPUStat[];
	    uptime: number;
	
	    static createFrom(source: any = {}) {
	        return new Snapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.time = source["time"];
	        this.cpu = this.convertValues(source["cpu"], CPUStat);
	        this.memory = this.convertValues(source["memory"], MemStat);
	        this.swap = this.convertValues(source["swap"], MemStat);
	        this.disks = this.convertValues(source["disks"], DiskStat);
	        this.diskIO = this.convertValues(source["diskIO"], IOStat);
	        this.network = this.convertValues(source["network"], NetStat);
	        this.temps = this.convertValues(source["temps"], TempStat);
	        this.gpus = this.convertValues(source["gpus"], GPUStat);
	        this.uptime = source["uptime"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

