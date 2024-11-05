// HomePage.js
import React from 'react';
import { Link } from 'react-router-dom';
import Navbar from './NavBar';

const HomePage = () => {
    return (
        <>
            <Navbar/>
            <div style={styles.container}>
                {/* Getting Started Section */}
                <section style={styles.section}>
                <h2 style={styles.sectionTitle}>Getting Started</h2>
                <div style={styles.row}>
                    <Card title="Upload PPI Interaction File" icon="📄" link="/program" />
                    <Card title="View Documentation" icon="❓" link="https://github.com/alperuzun/NetCancer-Insight" />
                </div>
            </section>


            {/* Features Section */}
            <section style={styles.section}>
                <h2 style={styles.sectionTitle}>Features</h2>
                <div style={styles.row}>
                    <Card title="Interactive graph representations of PPI networks" icon="📊" />
                    <Card title="Integrated network annotations through OncoKB, NCG, Reactome, GO terms, String, and cBioPortal" icon="🗄️"/>
                    <Card title="Querying and filtering for specific cancer related proteins" icon="🔍"/>
                    <Card title="Allows for comparative analysis of two PPI networks" icon="🔗"/>
                </div>
            </section>


            {/* Acknowledgements Section */}
            <section style={styles.section}>
                <h2 style={styles.sectionTitle}>Acknowledgements</h2>
                <div style={styles.row}>
                    <img src="/images/Brown_Logo.png" alt="Brown University" style={styles.logo} />
                    <img src="/images/Legoretta.png" alt="Legorreta Cancer Center" style={styles.logo} />
                    <img src="/images/Warren_Alpert_Logo.png" alt="Warren Alpert Medical School" style={styles.logo} />
                </div>
            </section>


                {/* Contact Section */}
                <section style={styles.section}>
                    <h2 style={styles.sectionTitle}>Contact</h2>
                    <div style={styles.row}>
                        <ContactInfo name="Alper Uzun, PhD" email="alper_uzun@brown.edu" />
                        <ContactInfo name="Abhinav Chede" email="abhinav_chede@brown.edu" />
                    </div>
                </section>
            </div>
        </>
    );
};

// Reusable Card Component with Link
const Card = ({ title, subtitle, icon, link }) => (
    <div style={styles.card}>
        <span style={styles.icon}>{icon}</span>
        <Link to={link} style={styles.cardTitle}>
            {title}
        </Link>
        {subtitle && <p style={styles.subtitle}>{subtitle}</p>}
    </div>
);

// Reusable Contact Info Component
const ContactInfo = ({ name, email }) => (
    <div style={styles.contactCard}>
        <p style={styles.contactName}>{name}</p>
        <p style={styles.contactEmail}>{email}</p>
    </div>
);

// CSS Styles
const styles = {
    container: {
        fontFamily: 'Arial, sans-serif',
        color: '#333',
        textAlign: 'center',
        padding: '20px',
        backgroundColor: '#f5f8fa',
    },
    section: {
        marginBottom: '40px',
    },
    sectionTitle: {
        fontSize: '24px',
        fontWeight: 'bold',
        color: '#666',
        marginBottom: '20px',
    },
    row: {
        display: 'flex',
        justifyContent: 'center',
        gap: '20px',
        flexWrap: 'wrap',
    },
    card: {
        width: '250px',
        padding: '20px',
        backgroundColor: '#fff',
        borderRadius: '8px',
        boxShadow: '0 4px 8px rgba(0, 0, 0, 0.1)',
        textAlign: 'center',
        transition: 'transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out',
        cursor: 'pointer',
    },
    cardHover: {
        transform: 'translateY(-5px)',
        boxShadow: '0 8px 16px rgba(0, 0, 0, 0.2)',
    },
    icon: {
        fontSize: '40px',
        marginBottom: '10px', // Ensures the icon is above the title with some space
    },
    cardTitle: {
        fontSize: '18px',
        fontWeight: 'bold',
        color: '#333',
        textDecoration: 'none',
        display: 'block',
        marginTop: '10px',
    },
    subtitle: {
        fontSize: '14px',
        color: '#888',
    },
    logo: {
        width: '300px',
        height: '150px',
        margin: '0 10px',
    },
    contactCard: {
        textAlign: 'center',
        padding: '10px',
        backgroundColor: '#f9f9f9',
        borderRadius: '8px',
        width: '200px',
    },
    contactName: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#333',
    },
    contactEmail: {
        fontSize: '14px',
        color: '#666',
    },
};

export default HomePage;
