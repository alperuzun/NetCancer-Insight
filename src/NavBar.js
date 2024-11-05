import React from 'react';
import {Link} from 'react-router-dom';
import './Navbar.css'; // Optional: For custom styling

const Navbar = () => {
    return (
        <nav className="navbar">
            <ul className="nav-categories">
                <Link to="/">Home</Link>
                <Link to="/program">Analysis</Link>
                {/* <Link to="/">Analysis</Link>
                <Link to="/">Analysis</Link>
                <Link to="/">Analysis</Link>
                <li>Installation</li>
                <li>Tutorial</li>
                <li>Demonstration</li>
                <li>Credits</li> */}
            </ul>
        </nav>
    );
}

export default Navbar;
