import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { PiecePawn } from "../components/icons/Icons";

const API_BASE = "http://localhost:8000";

const sidebarItems = [
    { label: "Board & Pieces", icon: "fa-chess-board" },
    { label: "Gameplay", icon: "fa-chess-knight" },
    { label: "Profile", icon: "fa-user", active: true },
    { label: "Interface", icon: "fa-laptop" },
    { label: "Social", icon: "fa-user-group" },
    { label: "Coach", icon: "fa-graduation-cap" },
    { label: "Notifications", icon: "fa-bell" },
    { label: "Account", Icon: PiecePawn },
];

const SelectField = ({ value, options }) => (
    <div className="relative">
        <select
            value={value}
            onChange={() => {}}
            className="w-full appearance-none bg-[#343330] border border-[#4a4845] rounded-md px-3 py-2 text-[#d7d6d4] text-[13px] font-medium outline-none"
        >
            {options.map((option) => <option key={option}>{option}</option>)}
        </select>
        <i className="fas fa-caret-down absolute right-4 top-1/2 -translate-y-1/2 text-[#989795] pointer-events-none"></i>
    </div>
);

const TextField = ({ value = "", placeholder = "", onChange = () => {} }) => (
    <input
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        className="w-full bg-[#343330] border border-[#4a4845] rounded-md px-3 py-2 text-[#d7d6d4] placeholder:text-[#777] text-[13px] font-medium outline-none focus:border-[#81b64c]"
    />
);

const DetailRow = ({ label, children }) => (
    <div className="grid grid-cols-[165px_minmax(0,1fr)] items-center gap-7">
        <div className="text-[#bab9b8] text-[14px] font-bold leading-tight">{label}</div>
        <div>{children}</div>
    </div>
);

const SettingsProfilePage = () => {
    const [username, setUsername] = useState(localStorage.getItem("chessUsername") || "Viki");
    const [savedUsername, setSavedUsername] = useState(localStorage.getItem("chessUsername") || "Viki");
    const [firstName, setFirstName] = useState("");
    const [savedFirstName, setSavedFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [savedLastName, setSavedLastName] = useState("");
    const [bio, setBio] = useState("");
    const [savedBio, setSavedBio] = useState("");
    const [aboutMe, setAboutMe] = useState("");
    const [savedAboutMe, setSavedAboutMe] = useState("");
    const [isSavingBio, setIsSavingBio] = useState(false);
    const [isSavingAbout, setIsSavingAbout] = useState(false);
    const [isSavingUsername, setIsSavingUsername] = useState(false);
    const [isSavingName, setIsSavingName] = useState(false);
    const [bioSavedFlash, setBioSavedFlash] = useState(false);
    const [aboutSavedFlash, setAboutSavedFlash] = useState(false);
    const [usernameSavedFlash, setUsernameSavedFlash] = useState(false);
    const [nameSavedFlash, setNameSavedFlash] = useState(false);
    const [usernameError, setUsernameError] = useState("");
    const joinDate = useMemo(() => "Apr 8, 2026", []);
    const token = localStorage.getItem("chessToken");
    const isBioDirty = bio !== savedBio;
    const isAboutDirty = aboutMe !== savedAboutMe;
    const isUsernameDirty = username.trim() !== savedUsername;
    const isNameDirty = firstName !== savedFirstName || lastName !== savedLastName;
    const fullName = [savedFirstName, savedLastName].filter(Boolean).join(" ");

    useEffect(() => {
        let isMounted = true;

        axios.get(`${API_BASE}/profile`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then((res) => {
            if (!isMounted) return;
            const nextBio = res.data.bio || "";
            const nextAboutMe = res.data.about_me || "";
            const nextUsername = res.data.username || username;
            const nextFirstName = res.data.first_name || "";
            const nextLastName = res.data.last_name || "";
            setUsername(nextUsername);
            setSavedUsername(nextUsername);
            setBio(nextBio);
            setSavedBio(nextBio);
            setAboutMe(nextAboutMe);
            setSavedAboutMe(nextAboutMe);
            setFirstName(nextFirstName);
            setSavedFirstName(nextFirstName);
            setLastName(nextLastName);
            setSavedLastName(nextLastName);
        }).catch((err) => {
            console.error("Could not load profile settings", err);
        });

        return () => {
            isMounted = false;
        };
    }, [token]);

    const flashSaved = (setFlash) => {
        setFlash(true);
        window.setTimeout(() => setFlash(false), 1400);
    };

    const saveProfile = async (payload, onSaved, setSaving, setFlash, onError) => {
        setSaving(true);
        try {
            const res = await axios.put(`${API_BASE}/profile`, payload, {
                headers: { Authorization: `Bearer ${token}` },
            });
            onSaved(res.data);
            flashSaved(setFlash);
        } catch (err) {
            console.error("Could not save profile settings", err);
            onError?.(err);
        } finally {
            setSaving(false);
        }
    };

    const saveBio = () => {
        if (!isBioDirty || isSavingBio) return;
        saveProfile({ bio }, (data) => {
            const nextBio = data.bio || "";
            setBio(nextBio);
            setSavedBio(nextBio);
        }, setIsSavingBio, setBioSavedFlash);
    };

    const saveUsername = () => {
        const nextUsername = username.trim();
        if (!nextUsername || !isUsernameDirty || isSavingUsername) return;
        setUsernameError("");
        saveProfile({ username: nextUsername }, (data) => {
            const saved = data.username || nextUsername;
            setUsername(saved);
            setSavedUsername(saved);
            localStorage.setItem("chessUsername", saved);
        }, setIsSavingUsername, setUsernameSavedFlash, (err) => {
            if (err.response?.status === 409) {
                setUsernameError("This username is already taken.");
                return;
            }
            setUsernameError("Could not change username.");
        });
    };

    const saveName = () => {
        if (!isNameDirty || isSavingName) return;
        saveProfile({ first_name: firstName, last_name: lastName }, (data) => {
            const nextFirstName = data.first_name || "";
            const nextLastName = data.last_name || "";
            setFirstName(nextFirstName);
            setSavedFirstName(nextFirstName);
            setLastName(nextLastName);
            setSavedLastName(nextLastName);
        }, setIsSavingName, setNameSavedFlash);
    };

    const saveAboutMe = () => {
        if (!isAboutDirty || isSavingAbout) return;
        saveProfile({ about_me: aboutMe }, (data) => {
            const nextAboutMe = data.about_me || "";
            setAboutMe(nextAboutMe);
            setSavedAboutMe(nextAboutMe);
        }, setIsSavingAbout, setAboutSavedFlash);
    };

    return (
        <div className="min-h-screen bg-[#2c2a27] text-white px-6 py-5">
            <div className="max-w-[1380px] mx-auto">
                <div className="flex items-center gap-3 mb-5">
                    <div className="w-12 h-12 rounded-full bg-[#d7d6d4] text-[#454241] flex items-center justify-center shadow-inner">
                        <i className="fas fa-gear text-2xl"></i>
                    </div>
                    <h1 className="text-[30px] font-black tracking-tight">Settings</h1>
                </div>

                <div className="bg-[#242320] rounded-md min-h-[660px] shadow-sm flex overflow-hidden">
                    <aside className="w-[290px] shrink-0 border-r border-[#3c3a37] py-9">
                        <div className="px-7 mb-6">
                            <div className="h-[46px] bg-[#363532] border border-[#504e4a] rounded-md flex items-center px-3.5 gap-3 text-[#989795]">
                                <i className="fas fa-search text-xl"></i>
                                <span className="text-[14px] font-medium">Search Settings</span>
                            </div>
                        </div>

                        <nav className="flex flex-col">
                            {sidebarItems.map((item) => (
                                <button
                                    key={item.label}
                                    className={`h-[56px] px-7 flex items-center gap-3.5 text-left text-[15px] font-bold transition-colors relative ${item.active ? "bg-[#302f2c] text-white" : "text-[#d7d6d4] hover:bg-[#2c2b28]"}`}
                                >
                                    {item.Icon ? (
                                        <item.Icon size={26} className={`w-6 ${item.active ? "text-white" : "text-[#989795]"}`} />
                                    ) : (
                                        <i className={`fas ${item.icon} w-6 text-xl ${item.active ? "text-white" : "text-[#989795]"}`}></i>
                                    )}
                                    <span>{item.label}</span>
                                    {item.active && <span className="absolute right-0 top-0 h-full w-1 bg-[#d7d6d4]"></span>}
                                </button>
                            ))}
                        </nav>
                    </aside>

                    <section className="flex-1 px-10 py-10 overflow-hidden">
                        <div className="max-w-[790px]">
                            <h2 className="text-[25px] font-black mb-3">Public Profile</h2>
                            <p className="text-[#989795] text-[14px] leading-tight max-w-[640px] mb-7 font-semibold">
                                Edit your profile, change your avatar, and choose your language. Everything here will be visible on your public profile.
                            </p>

                            <div className="grid grid-cols-[170px_minmax(0,1fr)] gap-7 mb-16">
                                <div className="w-[170px] h-[170px] bg-[#e9e8e6] rounded-md flex items-center justify-center overflow-hidden">
                                    <img src="/assets/icons/noavatar.gif" alt="avatar" className="w-full opacity-55" />
                                </div>

                                <div className="pt-1">
                                    <div className="flex items-center gap-3 mb-7">
                                        <h3 className="text-[23px] font-black">{username}</h3>
                                        <div className="w-9 h-6 rounded-sm overflow-hidden border border-[#3c3a37]">
                                            <div className="h-1/3 bg-[#ce2939]"></div>
                                            <div className="h-1/3 bg-white"></div>
                                            <div className="h-1/3 bg-[#477050]"></div>
                                        </div>
                                    </div>
                                    {fullName && (
                                        <div className="text-[#bab9b8] text-[16px] font-semibold -mt-5 mb-6">{fullName}</div>
                                    )}

                                    <textarea
                                        value={bio}
                                        onChange={(event) => setBio(event.target.value.slice(0, 50))}
                                        placeholder="Your short bio will appear next to your avatar."
                                        className="w-full h-[92px] bg-[#343330] border border-[#504e4a] rounded-md px-3.5 py-2.5 text-[#d7d6d4] placeholder:text-[#8b8987] text-[14px] font-semibold resize-none outline-none focus:border-[#81b64c]"
                                    />
                                    <div className="text-[#989795] text-[13px] mt-1.5">{bio.length}/50</div>

                                    <div className="grid grid-cols-2 gap-3 mt-7 max-w-[400px]">
                                        <button
                                            onClick={() => setBio(savedBio)}
                                            disabled={!isBioDirty || isSavingBio}
                                            className="h-[46px] rounded-md bg-gradient-to-b from-[#3a3936] to-[#2d2c29] disabled:opacity-55 text-[#d7d6d4] font-black text-[15px] shadow-sm"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={saveBio}
                                            disabled={!isBioDirty || isSavingBio}
                                            className={`h-[46px] rounded-md font-black text-[15px] shadow-sm transition-all ${
                                                isBioDirty
                                                    ? "bg-gradient-to-b from-[#8bc34a] to-[#5fa444] text-white"
                                                    : "bg-gradient-to-b from-[#5f8f43] to-[#477436] text-[#bab9b8] opacity-65"
                                            }`}
                                        >
                                            {isSavingBio ? "Saving..." : bioSavedFlash ? "Saved" : "Save"}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="border-t border-[#3c3a37] pt-9">
                                <h2 className="text-[20px] font-black mb-5">Details</h2>
                                <div className="flex flex-col gap-2.5 max-w-[660px]">
                                    <DetailRow label="Join Date"><div className="text-[#d7d6d4] text-[14px] font-semibold">{joinDate}</div></DetailRow>
                                    <DetailRow label="Username">
                                        <div>
                                            <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-3 items-center">
                                                <TextField value={username} onChange={(event) => {
                                                    setUsername(event.target.value);
                                                    setUsernameError("");
                                                }} />
                                                <button
                                                    onClick={saveUsername}
                                                    disabled={!isUsernameDirty || isSavingUsername || !username.trim()}
                                                    className={`h-[46px] rounded-md font-black text-[15px] transition-all ${
                                                        isUsernameDirty
                                                            ? "bg-gradient-to-b from-[#8bc34a] to-[#5fa444] text-white"
                                                            : "bg-gradient-to-b from-[#3a3936] to-[#2d2c29] text-[#d7d6d4] opacity-70"
                                                    }`}
                                                >
                                                    {isSavingUsername ? "Saving..." : usernameSavedFlash ? "Saved" : "Change"}
                                                </button>
                                            </div>
                                            {usernameError && <div className="text-[#fa412d] text-[12px] font-semibold mt-2">{usernameError}</div>}
                                        </div>
                                    </DetailRow>
                                    <DetailRow label="First Name"><TextField value={firstName} onChange={(event) => setFirstName(event.target.value)} /></DetailRow>
                                    <DetailRow label="Last Name"><TextField value={lastName} onChange={(event) => setLastName(event.target.value)} /></DetailRow>
                                    <DetailRow label="">
                                        <div className="grid grid-cols-2 gap-3 max-w-[400px]">
                                            <button
                                                onClick={() => {
                                                    setFirstName(savedFirstName);
                                                    setLastName(savedLastName);
                                                }}
                                                disabled={!isNameDirty || isSavingName}
                                                className="h-[46px] rounded-md bg-gradient-to-b from-[#3a3936] to-[#2d2c29] disabled:opacity-55 text-[#d7d6d4] font-black text-[15px] shadow-sm"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={saveName}
                                                disabled={!isNameDirty || isSavingName}
                                                className={`h-[46px] rounded-md font-black text-[15px] shadow-sm transition-all ${
                                                    isNameDirty
                                                        ? "bg-gradient-to-b from-[#8bc34a] to-[#5fa444] text-white"
                                                        : "bg-gradient-to-b from-[#5f8f43] to-[#477436] text-[#bab9b8] opacity-65"
                                                }`}
                                            >
                                                {isSavingName ? "Saving..." : nameSavedFlash ? "Saved" : "Save"}
                                            </button>
                                        </div>
                                    </DetailRow>
                                    <DetailRow label="Location"><TextField /></DetailRow>
                                    <DetailRow label="Country"><SelectField value="Hungary" options={["Hungary"]} /></DetailRow>
                                    <DetailRow label="Language"><SelectField value="English" options={["English"]} /></DetailRow>
                                    <DetailRow label="Show content in multiple languages">
                                        <div>
                                            <SelectField value="My Language Only" options={["My Language Only"]} />
                                            <div className="text-[#8b8987] text-[13px] mt-2">Filters news and articles</div>
                                        </div>
                                    </DetailRow>
                                    <DetailRow label="Timezone"><SelectField value="Europe/Budapest (+02:00)" options={["Europe/Budapest (+02:00)"]} /></DetailRow>
                                    <DetailRow label="OTB Rating">
                                        <div className="grid grid-cols-[140px_126px] gap-3">
                                            <SelectField value="--" options={["--"]} />
                                            <TextField value="0" />
                                        </div>
                                    </DetailRow>
                                    <DetailRow label="About me">
                                        <div>
                                            <textarea
                                                value={aboutMe}
                                                onChange={(event) => setAboutMe(event.target.value)}
                                                className="w-full h-20 bg-[#343330] border border-[#4a4845] rounded-md px-3.5 py-2.5 text-[#d7d6d4] outline-none focus:border-[#81b64c] resize-none"
                                            />
                                            <div className="grid grid-cols-2 gap-3 mt-4 max-w-[400px]">
                                                <button
                                                    onClick={() => setAboutMe(savedAboutMe)}
                                                    disabled={!isAboutDirty || isSavingAbout}
                                                    className="h-[46px] rounded-md bg-gradient-to-b from-[#3a3936] to-[#2d2c29] disabled:opacity-55 text-[#d7d6d4] font-black text-[15px] shadow-sm"
                                                >
                                                    Cancel
                                                </button>
                                                <button
                                                    onClick={saveAboutMe}
                                                    disabled={!isAboutDirty || isSavingAbout}
                                                    className={`h-[46px] rounded-md font-black text-[15px] shadow-sm transition-all ${
                                                        isAboutDirty
                                                            ? "bg-gradient-to-b from-[#8bc34a] to-[#5fa444] text-white"
                                                            : "bg-gradient-to-b from-[#5f8f43] to-[#477436] text-[#bab9b8] opacity-65"
                                                    }`}
                                                >
                                                    {isSavingAbout ? "Saving..." : aboutSavedFlash ? "Saved" : "Save"}
                                                </button>
                                            </div>
                                        </div>
                                    </DetailRow>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default SettingsProfilePage;
