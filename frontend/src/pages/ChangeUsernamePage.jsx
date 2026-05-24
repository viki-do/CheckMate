import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { PiecePawn } from "../components/icons/Icons";
import { API_BASE } from "../config/api";

const sidebarItems = [
    { label: "Board & Pieces", icon: "fa-chess-board" },
    { label: "Gameplay", icon: "fa-chess-knight" },
    { label: "Profile", icon: "fa-user", active: true },
    { label: "Interface", icon: "fa-laptop" },
    { label: "Social", icon: "fa-user-group" },
    { label: "Coach", icon: "fa-graduation-cap" },
    { label: "Notifications", icon: "fa-bell" },
    { label: "Account", Icon: PiecePawn },
    { label: "Membership", icon: "fa-credit-card" },
    { label: "Accessibility", icon: "fa-universal-access" },
];

const Field = ({ label, type = "text", value, onChange }) => (
    <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-[220px_minmax(0,345px)] md:gap-8">
        <label className="text-white text-[16px] font-medium">{label}</label>
        <div>
            <input
                type={type}
                value={value}
                onChange={onChange}
                className="w-full h-[46px] bg-[#343330] border border-[#4a4845] rounded-md px-3 text-[#d7d6d4] text-[15px] font-medium outline-none focus:border-[#81b64c]"
            />
        </div>
    </div>
);

const Requirement = ({ isValid, label }) => (
    <div className="flex items-center gap-2 text-white text-[15px] font-medium">
        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[12px] font-black ${isValid ? "bg-[#81b64c] text-[#1f2a18]" : "bg-[#fa412d] text-[#1f1f1d]"}`}>
            <i className={`fas ${isValid ? "fa-check" : "fa-times"}`}></i>
        </span>
        <span>{label}</span>
    </div>
);

const getUsernameRequirements = (value) => {
    const username = value.trim();
    return [
        { label: "1 letter", isValid: /[A-Za-z]/.test(username) },
        { label: "Begins with a letter or number", isValid: /^[A-Za-z0-9]/.test(username) },
        { label: "3-25 characters", isValid: username.length >= 3 && username.length <= 25 },
        { label: "Only letters, numbers, hyphens, and underscores are allowed", isValid: /^[A-Za-z0-9_-]*$/.test(username) && username.length > 0 },
        { label: "Hyphens or underscores must be followed by a letter or number", isValid: username.length > 0 && !/[-_](?![A-Za-z0-9])/.test(username) },
    ];
};

const ChangeUsernamePage = () => {
    const navigate = useNavigate();
    const token = localStorage.getItem("chessToken");
    const [newUsername, setNewUsername] = useState("");
    const [password, setPassword] = useState("");
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState("");
    const [errorType, setErrorType] = useState("warning");
    const [hasTouchedUsername, setHasTouchedUsername] = useState(false);
    const [availability, setAvailability] = useState({ status: "idle", reason: null });
    const usernameRequirements = getUsernameRequirements(newUsername);
    const isUsernameValid = usernameRequirements.every((requirement) => requirement.isValid);
    const isUsernameAvailable = availability.status === "available";

    const canSubmit = isUsernameValid && isUsernameAvailable && password.trim() && !isSaving;

    useEffect(() => {
        const username = newUsername.trim();
        if (!isUsernameValid) {
            setAvailability({ status: "idle", reason: null });
            return undefined;
        }

        setAvailability({ status: "checking", reason: null });
        const timer = window.setTimeout(async () => {
            try {
                const res = await axios.get(`${API_BASE}/profile/username/check`, {
                    params: { username },
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (res.data.available) {
                    setAvailability({ status: "available", reason: null });
                    return;
                }
                setAvailability({ status: "unavailable", reason: res.data.reason || "taken" });
            } catch {
                setAvailability({ status: "unavailable", reason: "error" });
            }
        }, 350);

        return () => window.clearTimeout(timer);
    }, [newUsername, isUsernameValid, token]);

    const availabilityMessage = (() => {
        if (availability.status !== "unavailable") return "";
        if (availability.reason === "current") return "This is your current username.";
        if (availability.reason === "error") return "Could not check this username.";
        return "This username is taken.";
    })();

    const handleChangeUsername = async () => {
        if (!canSubmit) return;
        setIsSaving(true);
        setError("");
        setErrorType("warning");
        try {
            const res = await axios.put(`${API_BASE}/profile/username`, {
                username: newUsername.trim(),
                password,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const savedUsername = res.data.username || newUsername.trim();
            localStorage.setItem("chessUsername", savedUsername);
            navigate("/settings/profile");
        } catch (err) {
            if (err.response?.status === 409) {
                setError(err.response?.data?.detail || "This username is taken.");
                setErrorType("warning");
            } else if (err.response?.status === 401) {
                setError("Incorrect password.");
                setErrorType("danger");
            } else {
                setError("Could not change username.");
                setErrorType("danger");
            }
        } finally {
            setIsSaving(false);
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

                <div className="bg-[#242320] rounded-md min-h-[660px] shadow-sm flex flex-col overflow-hidden lg:flex-row">
                    <aside className="w-full shrink-0 border-b border-[#3c3a37] py-5 lg:w-[290px] lg:border-b-0 lg:border-r lg:py-9">
                        <div className="px-7 mb-6">
                            <div className="h-[46px] bg-[#363532] border border-[#504e4a] rounded-md flex items-center px-3.5 gap-3 text-[#989795]">
                                <i className="fas fa-search text-xl"></i>
                                <span className="text-[14px] font-medium">Search Settings</span>
                            </div>
                        </div>

                        <nav className="flex overflow-x-auto lg:flex-col">
                            {sidebarItems.map((item) => (
                                <button
                                    key={item.label}
                                    onClick={() => {
                                        if (item.label === "Profile") navigate("/settings/profile");
                                    }}
                                    className={`h-[56px] px-5 lg:px-7 flex shrink-0 items-center gap-3.5 text-left text-[15px] font-bold transition-colors relative ${item.active ? "bg-[#302f2c] text-white" : "text-[#d7d6d4] hover:bg-[#2c2b28]"}`}
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

                    <section className="flex-1 px-5 py-7 overflow-y-auto lg:px-12 lg:py-12">
                        <div className="max-w-[780px]">
                            <h2 className="text-[25px] font-black mb-3">Change Username</h2>
                            <p className="text-[#bab9b8] text-[16px] mb-12 font-medium">
                                Usernames can only be changed once every 90 days.
                            </p>

                            {(error || availabilityMessage) && (
                                <div className={`mb-5 w-full max-w-[760px] min-h-[56px] rounded-sm flex items-center gap-4 px-5 text-white border-l-4 ${
                                    error && errorType === "danger"
                                        ? "bg-[#3d2522] border-[#ff4b35]"
                                        : "bg-[#3b3420] border-[#f0b429]"
                                }`}>
                                    <span className={`w-7 h-7 rounded-full flex items-center justify-center font-black ${
                                        error && errorType === "danger"
                                            ? "bg-[#ff4b35] text-[#2b2926]"
                                            : "bg-[#f0b429] text-[#2b2926]"
                                    }`}>
                                        <i className="fas fa-exclamation"></i>
                                    </span>
                                    <span className="text-[15px] font-bold">{error || availabilityMessage}</span>
                                </div>
                            )}

                            <div className="flex flex-col gap-5">
                                <div className="grid grid-cols-1 items-start gap-2 md:grid-cols-[220px_minmax(0,500px)] md:gap-8">
                                    <label className="text-white text-[16px] font-medium pt-3">New Username</label>
                                    <div>
                                        <input
                                            value={newUsername}
                                            onChange={(event) => {
                                                setNewUsername(event.target.value);
                                                setHasTouchedUsername(true);
                                                if (error) {
                                                    setError("");
                                                    setErrorType("warning");
                                                }
                                            }}
                                            className="w-full max-w-[345px] h-[46px] bg-[#343330] border border-[#4a4845] rounded-md px-3 text-[#d7d6d4] text-[15px] font-medium outline-none focus:border-[#81b64c]"
                                        />
                                        {hasTouchedUsername && (
                                            <div className="mt-3 flex flex-col gap-2">
                                                {usernameRequirements.map((requirement) => (
                                                    <Requirement
                                                        key={requirement.label}
                                                        isValid={requirement.isValid}
                                                        label={requirement.label}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                        {isUsernameValid && availability.status === "checking" && (
                                            <div className="mt-3 text-[#8b8987] text-[13px] font-bold">Checking availability...</div>
                                        )}
                                        {isUsernameValid && availability.status === "available" && (
                                            <div className="mt-3 text-[#81b64c] text-[13px] font-bold">Username is available.</div>
                                        )}
                                    </div>
                                </div>
                                <Field
                                    label="Password"
                                    type="password"
                                    value={password}
                                    onChange={(event) => setPassword(event.target.value)}
                                />
                            </div>

                            <div className="mt-3 flex items-center gap-3">
                                <button
                                    onClick={handleChangeUsername}
                                    disabled={!canSubmit}
                                    className={`w-full max-w-60 h-[46px] rounded-md font-black text-[15px] transition-all ${
                                        canSubmit
                                            ? "bg-gradient-to-b from-[#8bc34a] to-[#5fa444] text-white hover:from-[#9bd45c] hover:to-[#6cb64e]"
                                            : "bg-gradient-to-b from-[#5f8f43] to-[#477436] text-[#bab9b8] opacity-65"
                                    }`}
                                >
                                    {isSaving ? "Changing..." : "Change"}
                                </button>
                                {error && errorType === "danger" && (
                                    <span className="w-7 h-7 rounded-full bg-[#ff4b35] text-[#2b2926] flex items-center justify-center font-black">
                                        <i className="fas fa-exclamation"></i>
                                    </span>
                                )}
                            </div>

                            <div className="border-t border-[#3c3a37] mt-12"></div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default ChangeUsernamePage;
