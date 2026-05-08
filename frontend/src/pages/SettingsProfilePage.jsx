import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
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

const TextField = ({ value = "", placeholder = "", onChange = () => {}, readOnly = false, type = "text" }) => (
    <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        readOnly={readOnly}
        className={`w-full bg-[#343330] border border-[#4a4845] rounded-md px-3 py-2 text-[#d7d6d4] placeholder:text-[#777] text-[13px] font-medium outline-none focus:border-[#81b64c] ${readOnly ? "cursor-default opacity-85" : ""}`}
    />
);

const DetailRow = ({ label, children }) => (
    <div className="grid grid-cols-[165px_minmax(0,1fr)] items-center gap-7">
        <div className="text-[#bab9b8] text-[14px] font-bold leading-tight">{label}</div>
        <div>{children}</div>
    </div>
);

const formatJoinDate = (value) => {
    if (!value) return "";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "";
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(date);
};

const getAvatarSrc = (avatarUrl) => {
    if (!avatarUrl) return "/assets/icons/noavatar.gif";
    if (avatarUrl.startsWith("http")) return avatarUrl;
    return `${API_BASE}${avatarUrl}`;
};

const SettingsProfilePage = () => {
    const navigate = useNavigate();
    const avatarInputRef = useRef(null);
    const [username, setUsername] = useState(localStorage.getItem("chessUsername") || "Viki");
    const [firstName, setFirstName] = useState("");
    const [savedFirstName, setSavedFirstName] = useState("");
    const [lastName, setLastName] = useState("");
    const [savedLastName, setSavedLastName] = useState("");
    const [bio, setBio] = useState("");
    const [savedBio, setSavedBio] = useState("");
    const [aboutMe, setAboutMe] = useState("");
    const [savedAboutMe, setSavedAboutMe] = useState("");
    const [isSavingBio, setIsSavingBio] = useState(false);
    const [isSavingDetails, setIsSavingDetails] = useState(false);
    const [bioSavedFlash, setBioSavedFlash] = useState(false);
    const [detailsSavedFlash, setDetailsSavedFlash] = useState(false);
    const [createdAt, setCreatedAt] = useState("");
    const [avatarUrl, setAvatarUrl] = useState("");
    const [isAvatarSaving, setIsAvatarSaving] = useState(false);
    const [avatarError, setAvatarError] = useState("");
    const joinDate = useMemo(() => formatJoinDate(createdAt), [createdAt]);
    const token = localStorage.getItem("chessToken");
    const isBioDirty = bio !== savedBio;
    const isDetailsDirty = (
        firstName !== savedFirstName ||
        lastName !== savedLastName ||
        aboutMe !== savedAboutMe
    );
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
            setCreatedAt(res.data.created_at || "");
            setAvatarUrl(res.data.avatar_url || "");
            setUsername(nextUsername);
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

    const saveDetails = () => {
        if (!isDetailsDirty || isSavingDetails) return;
        saveProfile({
            first_name: firstName,
            last_name: lastName,
            about_me: aboutMe,
        }, (data) => {
            const nextFirstName = data.first_name || "";
            const nextLastName = data.last_name || "";
            const nextAboutMe = data.about_me || "";
            setFirstName(nextFirstName);
            setSavedFirstName(nextFirstName);
            setLastName(nextLastName);
            setSavedLastName(nextLastName);
            setAboutMe(nextAboutMe);
            setSavedAboutMe(nextAboutMe);
        }, setIsSavingDetails, setDetailsSavedFlash);
    };

    const cancelDetails = () => {
        setFirstName(savedFirstName);
        setLastName(savedLastName);
        setAboutMe(savedAboutMe);
    };

    const uploadAvatar = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = "";
        if (!file || isAvatarSaving) return;

        setIsAvatarSaving(true);
        setAvatarError("");
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await axios.post(`${API_BASE}/profile/avatar`, formData, {
                headers: {
                    Authorization: `Bearer ${token}`,
                    "Content-Type": "multipart/form-data",
                },
            });
            setAvatarUrl(res.data.avatar_url || "");
            window.dispatchEvent(new CustomEvent("profile-avatar-updated", {
                detail: { avatarUrl: res.data.avatar_url || "" },
            }));
        } catch (err) {
            setAvatarError(err.response?.data?.detail || "Could not upload avatar.");
        } finally {
            setIsAvatarSaving(false);
        }
    };

    const deleteAvatar = async (event) => {
        event.stopPropagation();
        if (!avatarUrl || isAvatarSaving) return;

        setIsAvatarSaving(true);
        setAvatarError("");
        try {
            const res = await axios.delete(`${API_BASE}/profile/avatar`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setAvatarUrl(res.data.avatar_url || "");
            window.dispatchEvent(new CustomEvent("profile-avatar-updated", {
                detail: { avatarUrl: res.data.avatar_url || "" },
            }));
        } catch (err) {
            setAvatarError(err.response?.data?.detail || "Could not remove avatar.");
        } finally {
            setIsAvatarSaving(false);
        }
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
                                <div>
                                    <div className="group relative w-[170px] h-[170px]">
                                        <button
                                            type="button"
                                            onClick={() => avatarInputRef.current?.click()}
                                            disabled={isAvatarSaving}
                                            className="relative w-full h-full bg-[#e9e8e6] rounded-md flex items-center justify-center overflow-hidden cursor-pointer disabled:cursor-wait"
                                            aria-label="Upload avatar"
                                        >
                                            <img
                                                src={getAvatarSrc(avatarUrl)}
                                                alt="avatar"
                                                className={`w-full h-full object-cover ${avatarUrl ? "" : "opacity-55"}`}
                                            />
                                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/45 transition-colors"></div>
                                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                                                <div className="relative text-[#f4f3f0] drop-shadow">
                                                    {avatarUrl ? (
                                                        <i className="fas fa-camera text-[42px]"></i>
                                                    ) : (
                                                        <>
                                                            <i className="fas fa-camera text-[42px]"></i>
                                                            <span className="absolute -right-3 -bottom-2 w-8 h-8 rounded-full bg-[#f4f3f0] text-[#4a4845] flex items-center justify-center border-2 border-[#5d5a56]">
                                                                <i className="fas fa-plus text-[18px]"></i>
                                                            </span>
                                                        </>
                                                    )}
                                                </div>
                                            </div>
                                        </button>
                                    </div>
                                    {avatarUrl && (
                                        <button
                                            type="button"
                                            onClick={deleteAvatar}
                                            disabled={isAvatarSaving}
                                            className="w-[170px] mt-3 flex items-center justify-center gap-2 text-[#d7d6d4] hover:text-white text-[15px] font-black disabled:opacity-60"
                                        >
                                            <i className="fas fa-trash text-[13px]"></i>
                                            Remove
                                        </button>
                                    )}
                                    <input
                                        ref={avatarInputRef}
                                        type="file"
                                        accept="image/png,image/jpeg,image/gif,image/webp"
                                        onChange={uploadAvatar}
                                        className="hidden"
                                    />
                                    {(isAvatarSaving || avatarError) && (
                                        <div className={`mt-2 text-[12px] font-bold ${avatarError ? "text-[#ff4b35]" : "text-[#8b8987]"}`}>
                                            {avatarError || "Saving avatar..."}
                                        </div>
                                    )}
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
                                <div className="flex items-center gap-3 mb-5">
                                    <h2 className="text-[20px] font-black">Details</h2>
                                    <span className="text-[#8b8987] text-[12px] font-bold">
                                        {isSavingDetails ? "Saving..." : detailsSavedFlash ? "Saved" : isDetailsDirty ? "Unsaved changes" : ""}
                                    </span>
                                </div>
                                <div className="flex flex-col gap-2.5 max-w-[660px]">
                                    <DetailRow label="Join Date"><div className="text-[#d7d6d4] text-[14px] font-semibold">{joinDate}</div></DetailRow>
                                    <DetailRow label="Username">
                                        <div>
                                            <div className="grid grid-cols-[minmax(0,1fr)_140px] gap-3 items-center">
                                                <TextField value={username} readOnly />
                                                <button
                                                    onClick={() => navigate("/settings/change-username")}
                                                    className="h-[46px] rounded-md font-black text-[15px] transition-all bg-gradient-to-b from-[#3a3936] to-[#2d2c29] text-[#d7d6d4] hover:from-[#45433f] hover:to-[#343330]"
                                                >
                                                    Change
                                                </button>
                                            </div>
                                        </div>
                                    </DetailRow>
                                    <DetailRow label="First Name"><TextField value={firstName} onChange={(event) => setFirstName(event.target.value)} /></DetailRow>
                                    <DetailRow label="Last Name"><TextField value={lastName} onChange={(event) => setLastName(event.target.value)} /></DetailRow>
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
                                        </div>
                                    </DetailRow>
                                    <DetailRow label="">
                                        <div className="grid grid-cols-2 gap-3 max-w-[400px] pt-2">
                                            <button
                                                onClick={cancelDetails}
                                                disabled={!isDetailsDirty || isSavingDetails}
                                                className="h-[46px] rounded-md bg-gradient-to-b from-[#3a3936] to-[#2d2c29] disabled:opacity-55 text-[#d7d6d4] font-black text-[15px] shadow-sm"
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                onClick={saveDetails}
                                                disabled={!isDetailsDirty || isSavingDetails}
                                                className={`h-[46px] rounded-md font-black text-[15px] shadow-sm transition-all ${
                                                    isDetailsDirty
                                                        ? "bg-gradient-to-b from-[#8bc34a] to-[#5fa444] text-white"
                                                        : "bg-gradient-to-b from-[#5f8f43] to-[#477436] text-[#bab9b8] opacity-65"
                                                }`}
                                            >
                                                {isSavingDetails ? "Saving..." : detailsSavedFlash ? "Saved" : "Save"}
                                            </button>
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
