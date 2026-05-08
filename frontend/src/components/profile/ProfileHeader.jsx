import { useNavigate } from "react-router-dom";

const API_BASE = "http://localhost:8000";

const getAvatarSrc = (avatarUrl) => {
    if (!avatarUrl) return "/assets/icons/noavatar.gif";
    if (avatarUrl.startsWith("http")) return avatarUrl;
    return `${API_BASE}${avatarUrl}`;
};

const ProfileHeader = ({ user, urlUsername }) => {
    const navigate = useNavigate();
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(" ");

    return (
        <div className="bg-[#262421] rounded-t-lg p-8 border-x border-t border-[#3c3a37] flex flex-col md:flex-row gap-8 relative">
            <div className="w-40 h-40 bg-[#312e2b] rounded-sm flex items-center justify-center border border-[#3c3a37] overflow-hidden shrink-0">
                <img
                    src={getAvatarSrc(user.avatar_url)}
                    alt="avatar"
                    className={`w-full h-full object-cover ${user.avatar_url ? "" : "opacity-50"}`}
                />
            </div>
            <div className="flex-1 space-y-4 text-white">
                <div className="flex items-center gap-3">
                    <h1 className="text-4xl font-bold">{user.username || urlUsername}</h1>
                </div>
                {fullName && (
                    <div className="text-[#d7d6d4] text-xl font-medium">
                        {fullName}
                    </div>
                )}
                <div className="flex items-center gap-2 text-[#8b8987] text-sm group cursor-pointer w-fit italic">
                    <span>{user.bio || "Enter a status here"}</span> <i className="fas fa-edit opacity-0 group-hover:opacity-100 transition-opacity"></i>
                </div>
            </div>
            <button
                onClick={() => navigate("/settings/profile")}
                className="absolute top-8 right-8 bg-[#3c3a37] hover:bg-[#4a4845] text-white px-4 py-1.5 rounded text-sm font-bold"
            >
                Edit Profile
            </button>
        </div>
    );
};

export default ProfileHeader;
