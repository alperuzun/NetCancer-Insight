import React from 'react';
import './Navbar.css'; // Optional: For custom styling

const Navbar = () => {
    return (
        <nav className="navbar">
            <ul className="nav-categories">
                <li>Analysis</li>
                <li>Installation</li>
                <li>Tutorial</li>
                <li>Demonstration</li>
                <li>Credits</li>
            </ul>
        </nav>
    );
}

export default Navbar;
