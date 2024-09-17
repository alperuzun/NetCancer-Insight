
import React, {useState} from "react";
import './styles.css';

const Filter = ({onSubmit, changeColor}) => {
    const [selectedDropdownValue, setSelectedDropdownValue] = useState("");
    const [selectedCancerType, setSelectedCancerType] = useState("");
    const [selectedOrganSystem, setSelectedOrganSystem] = useState("");
    const [selectedPrimarySite, setSelectedPrimarySite] = useState("");
    const handleDropdownChange = (event, d) => {
        const selectedOption = event.target.value;
        setSelectedDropdownValue(selectedOption)
    };

    const handleCancerTypeChange = (event, d) => {
        const selection = event.target.value;
        setSelectedCancerType(selection)
    };

    const handleOrganSystemChange = (event, d) => {
        const selection = event.target.value;
        setSelectedOrganSystem(selection)
    };

    const handlePrimarySiteChange = (event, d) => {
        const selection = event.target.value;
        setSelectedPrimarySite(selection)
    };

    const handleFilter = (event, d) => {
        // changeColor(new Set());
        onSubmit([selectedDropdownValue, selectedCancerType, selectedOrganSystem, selectedPrimarySite])
    }

    return (
        <div className="overlay">
            {/*<form onSubmit={this.handleSubmit}>*/}
            <form>
                <p>Cancer Type: </p>
                <input
                    type="text"
                    placeholder="Search..."
                    onChange={handleCancerTypeChange}
                    onKeyDown={handleCancerTypeChange}
                    onPaste={handleCancerTypeChange}
                    onInput={handleCancerTypeChange}
                    value={selectedCancerType}
                />
            </form>
            <form>
                <p>Organ System: </p>
                <input
                    type="text"
                    placeholder="Search..."
                    onChange={handleOrganSystemChange}
                    value={selectedOrganSystem}
                />
            </form>
            <form>
                <p>Primary Site: </p>
                <input
                    type="text"
                    placeholder="Search..."
                    onChange={handlePrimarySiteChange}
                    value={selectedPrimarySite}
                />
            </form>
            <p>Related Cancer: </p>
            <select
                id="nodeDropdown"
                onChange={handleDropdownChange}
                value={selectedDropdownValue}
            >
                <option value="" disabled>Select a Node</option>
                <option key="Bladder Urothelial Carcinoma" value="Bladder Urothelial Carcinoma">
                    Bladder Urothelial Carcinoma
                </option>
                <option key="Breast Cancer" value="Breast Cancer">
                    Breast Cancer
                </option>
                <option key="Colorectal Adenocarcinoma" value="Colorectal Adenocarcinoma">
                    Colorectal Adenocarcinoma
                </option>
                <option key="Lung Adenocarcinoma" value="Lung Adenocarcinoma">
                    Lung Adenocarcinoma
                </option>
                <option key="Pancreatic Adenocarcinoma" value="Pancreatic Adenocarcinoma">
                    Pancreatic Adenocarcinoma
                </option>
                <option key="Prostate Adenocarcinoma" value="Prostate Adenocarcinoma">
                    Prostate Adenocarcinoma
                </option>
                <option key="Thyroid Carcinoma" value="Thyroid Carcinoma">
                    Thyroid Carcinoma
                </option>
            </select>
            <button type="submit" onClick={handleFilter}>Search</button>
        </div>);
};


export default Filter;