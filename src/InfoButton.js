import React, { useState } from 'react';
import './InfoButton.css'; // Import the CSS styles

const InfoButton = ({ infoText }) => {
    const [isHovered, setIsHovered] = useState(false);

    const handleMouseEnter = () => {
        setIsHovered(true);
    };

    const handleMouseLeave = () => {
        setIsHovered(false);
    };

    return (
        <div className="info-button-container" onMouseEnter={handleMouseEnter} onMouseLeave={handleMouseLeave}>
            <button className="info-button">i</button>
            {isHovered && (
                <div className="info-panel">
                    <p>{infoText}</p>
                </div>
            )}
        </div>
    );
};

export default InfoButton;
