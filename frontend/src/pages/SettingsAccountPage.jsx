import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { PiecePawn } from "../components/icons/Icons";
import { PASSWORD_REQUIREMENTS_MESSAGE, passwordMeetsRequirements } from "../utils/passwordValidation";

const API_BASE = "http://localhost:8000";

const sidebarItems = [
    { label: "Board & Pieces", icon: "fa-chess-board" },
    { label: "Gameplay", icon: "fa-chess-knight" },
    { label: "Profile", icon: "fa-user" },
    { label: "Interface", icon: "fa-laptop" },
    { label: "Social", icon: "fa-user-group" },
    { label: "Coach", icon: "fa-graduation-cap" },
    { label: "Notifications", icon: "fa-bell" },
    { label: "Account", Icon: PiecePawn, active: true },
    { label: "Membership", icon: "fa-credit-card" },
    { label: "Accessibility", icon: "fa-universal-access" },
];

const PasswordField = ({ value, onChange, visible, onToggle, hasError = false }) => (
    <div className="relative w-[345px]">
        <input
            type={visible ? "text" : "password"}
            value={value}
            onChange={onChange}
            className={`w-full h-[46px] bg-[#343330] border rounded-md pl-3 pr-12 text-[#d7d6d4] text-[15px] font-medium outline-none ${
                hasError ? "border-[#ff4b35] focus:border-[#ff4b35]" : "border-[#4a4845] focus:border-[#81b64c]"
            }`}
        />
        <button
            type="button"
            onClick={onToggle}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9a9996] hover:text-white"
            aria-label={visible ? "Hide password" : "Show password"}
        >
            <i className={`fas ${visible ? "fa-eye-slash" : "fa-eye"} text-[18px]`}></i>
        </button>
    </div>
);

const maskEmail = (email) => {
    if (!email || !email.includes("@")) return "";
    const [name, domain] = email.split("@");
    const [host, ...suffixParts] = domain.split(".");
    const suffix = suffixParts.length ? `.${suffixParts.join(".")}` : "";
    const first = name.slice(0, 1) || "*";
    const last = name.slice(-1);
    const hostFirst = host.slice(0, 1) || "*";
    return `${first}${"*".repeat(Math.max(6, name.length - 1))}${last}@${hostFirst}${"*".repeat(Math.max(6, host.length - 1))}${suffix}`;
};

const AlertBanner = ({ type, text }) => {
    if (!text) return null;
    const isSuccess = type === "success";
    return (
        <div className={`mb-3 w-full max-w-[770px] min-h-[56px] rounded-sm border-l-4 flex items-center gap-4 px-5 ${
            isSuccess ? "bg-[#263320] border-[#81b64c]" : "bg-[#3e2521] border-[#ff4b35]"
        }`}>
            <span className={`w-7 h-7 rounded-full flex items-center justify-center font-black ${
                isSuccess ? "bg-[#81b64c] text-[#203018]" : "bg-[#ff4b35] text-[#2b2926]"
            }`}>
                <i className={`fas ${isSuccess ? "fa-check" : "fa-exclamation"} text-[15px]`}></i>
            </span>
            <span className="text-white text-[15px] font-bold">{text}</span>
        </div>
    );
};

const SettingsAccountPage = () => {
    const navigate = useNavigate();
    const token = localStorage.getItem("chessToken");
    const [email, setEmail] = useState("");
    const [currentPassword, setCurrentPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [retypePassword, setRetypePassword] = useState("");
    const [visibleFields, setVisibleFields] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [notice, setNotice] = useState({ type: "", text: "", fields: [] });
    const maskedEmail = useMemo(() => maskEmail(email), [email]);
    const canAttemptSave = currentPassword.length > 0 && newPassword.length > 0 && retypePassword.length > 0 && !isSaving;

    useEffect(() => {
        let isMounted = true;
        axios.get(`${API_BASE}/profile`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then((res) => {
            if (isMounted) setEmail(res.data.email || "");
        }).catch((err) => {
            console.error("Could not load account settings", err);
        });
        return () => {
            isMounted = false;
        };
    }, [token]);

    const toggleVisible = (field) => {
        setVisibleFields((prev) => ({ ...prev, [field]: !prev[field] }));
    };

    const updatePasswordField = (setter) => (event) => {
        setter(event.target.value);
        if (notice.text) setNotice({ type: "", text: "", fields: [] });
    };

    const fieldHasError = (field) => notice.type === "error" && notice.fields.includes(field);

    const savePassword = async () => {
        if (!canAttemptSave) return;
        if (!passwordMeetsRequirements(newPassword)) {
            setNotice({
                type: "error",
                text: PASSWORD_REQUIREMENTS_MESSAGE,
                fields: ["new"],
            });
            return;
        }
        if (newPassword !== retypePassword) {
            setNotice({
                type: "error",
                text: "Passwords must match.",
                fields: ["new", "retype"],
            });
            return;
        }
        if (newPassword === currentPassword) {
            setNotice({
                type: "error",
                text: "New password must be different.",
                fields: ["new"],
            });
            return;
        }

        setIsSaving(true);
        setNotice({ type: "", text: "", fields: [] });
        try {
            await axios.put(`${API_BASE}/profile/password`, {
                current_password: currentPassword,
                new_password: newPassword,
            }, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setNotice({
                type: "success",
                text: "Password changed successfully.",
                fields: [],
            });
            window.setTimeout(() => {
                localStorage.clear();
                navigate("/login", { replace: true });
                window.location.reload();
            }, 900);
        } catch (err) {
            const detail = err.response?.data?.detail || "Could not update password.";
            setNotice({
                type: "error",
                text: err.response?.status === 401 ? "Password is incorrect." : detail,
                fields: err.response?.status === 401 ? ["current"] : [],
            });
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
                                    onClick={() => {
                                        if (item.label === "Profile") navigate("/settings/profile");
                                        if (item.label === "Account") navigate("/settings/account");
                                    }}
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

                    <section className="flex-1 px-12 py-11 overflow-y-auto">
                        <div className="max-w-[840px]">
                            <h2 className="text-[25px] font-black mb-3">Account</h2>
                            <p className="text-[#989795] text-[14px] leading-tight mb-8 font-semibold">
                                Change your password, add account security, and view connected accounts.
                            </p>

                            <h3 className="text-[25px] font-black mb-10">Change Password</h3>
                            <AlertBanner type={notice.type} text={notice.text} />
                            <div className="flex flex-col gap-3.5 max-w-[650px]">
                                <div className="grid grid-cols-[220px_345px] items-center gap-8">
                                    <label className="text-white text-[14px] font-bold">Current password</label>
                                    <PasswordField
                                        value={currentPassword}
                                        onChange={updatePasswordField(setCurrentPassword)}
                                        visible={visibleFields.current}
                                        onToggle={() => toggleVisible("current")}
                                        hasError={fieldHasError("current")}
                                    />
                                </div>
                                <div className="grid grid-cols-[220px_345px] items-center gap-8">
                                    <label className="text-white text-[14px] font-bold">New password</label>
                                    <PasswordField
                                        value={newPassword}
                                        onChange={updatePasswordField(setNewPassword)}
                                        visible={visibleFields.new}
                                        onToggle={() => toggleVisible("new")}
                                        hasError={fieldHasError("new")}
                                    />
                                </div>
                                <div className="grid grid-cols-[220px_345px] items-center gap-8">
                                    <label className="text-white text-[14px] font-bold">Retype password</label>
                                    <PasswordField
                                        value={retypePassword}
                                        onChange={updatePasswordField(setRetypePassword)}
                                        visible={visibleFields.retype}
                                        onToggle={() => toggleVisible("retype")}
                                        hasError={fieldHasError("retype")}
                                    />
                                </div>
                            </div>

                            <div className="mt-8 flex items-center gap-3">
                                <button
                                    onClick={savePassword}
                                    disabled={!canAttemptSave}
                                    className={`w-[210px] h-[46px] rounded-md font-black text-[15px] transition-all bg-gradient-to-b from-[#3a3936] to-[#2d2c29] shadow-sm ${
                                        canAttemptSave ? "text-white hover:from-[#45433f] hover:to-[#343330]" : "text-[#8b8987] opacity-70"
                                    }`}
                                >
                                    {isSaving ? "Saving..." : "Save"}
                                </button>
                                {notice.text && (
                                    <span className={`w-7 h-7 rounded-full flex items-center justify-center font-black ${
                                        notice.type === "success" ? "text-[#81b64c]" : "bg-[#ff4b35] text-[#2b2926]"
                                    }`}>
                                        <i className={`fas ${notice.type === "success" ? "fa-check text-[24px]" : "fa-exclamation text-[15px]"}`}></i>
                                    </span>
                                )}
                            </div>

                            <div className="border-t border-[#3c3a37] mt-11 pt-11">
                                <h3 className="text-[25px] font-black mb-10">Contact Info</h3>
                                <div className="grid grid-cols-[220px_220px_210px] items-center gap-8">
                                    <div className="text-white text-[14px] font-bold">Email Address</div>
                                    <div className="text-[#bab9b8] text-[14px] font-black tracking-wide">{maskedEmail || "No email"}</div>
                                    <button className="h-[46px] rounded-md bg-gradient-to-b from-[#3a3936] to-[#2d2c29] text-[#d7d6d4] font-black text-[15px] shadow-sm hover:from-[#45433f] hover:to-[#343330]">
                                        Edit
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default SettingsAccountPage;
