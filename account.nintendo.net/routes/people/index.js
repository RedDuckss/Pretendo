let routes = require('express').Router(),
    helpers = require('../../helpers'),
    constants = require('../../constants'),
    database = require('../../db'),
    mailer = require('../../mailer'),
    randtoken = require('rand-token'),
    json2xml = require('json2xml'),
    bcrypt = require('bcryptjs'),
    moment = require('moment'),
    moment_timezone = require('moment-timezone'),
    puid = require('puid'),
    fs = require('fs-extra');

/**
 * [POST]
 * Replacement for: https://account.nintendo.net/v1/api/people/
 * Description: Registers a user
 */
routes.post('/', async (request, response) => {
    response.set('Server', 'Nintendo 3DS (http)');
    response.set('X-Nintendo-Date', new Date().getTime());

    let user_data = request.body,
        headers = request.headers;

    if (
        !headers['x-nintendo-client-id'] ||
        !headers['x-nintendo-client-secret'] ||
        !constants.VALID_CLIENT_ID_SECRET_PAIRS[headers['x-nintendo-client-id']] ||
        headers['x-nintendo-client-secret'] !== constants.VALID_CLIENT_ID_SECRET_PAIRS[headers['x-nintendo-client-id']]
    ) {
        response.set('Content-Type', 'text/xml');

        let error = {
            errors: {
                error: {
                    cause: 'client_id',
                    code: '0004',
                    message: 'API application invalid or incorrect application credentials'
                }
            }
        }

        return response.send(json2xml(error));
    }

    if (!headers['x-nintendo-serial-number']) {
        response.set('Content-Type', 'text/xml');
        
        let error = {
            errors: {
                error: {
                    code: '0002',
                    message: 'serialNumber format is invalid'
                }
            }
        }

        return response.send(json2xml(error));
    }

    if (!headers['x-nintendo-region']) {
        response.set('Content-Type', 'text/xml');
        
        let error = {
            errors: {
                error: {
                    cause: 'X-Nintendo-Region',
                    code: '0002',
                    message: 'X-Nintendo-Region format is invalid'
                }
            }
        }

        return response.send(json2xml(error));
    }

    if (
        !headers['x-nintendo-platform-id'] ||
        !headers['x-nintendo-device-id'] ||
        !headers['x-nintendo-device-cert']
    ) {
        response.set('Content-Type', 'text/xml');
        
        let error = {
            errors: {
                error: {
                    cause: 'device_id',
                    code: '0113',
                    message: 'Unauthorized device'
                }
            }
        }

        return response.send(json2xml(error));
    }


    let pid = await helpers.generatePID(),
        password = bcrypt.hashSync(helpers.generateNintendoHashedPWrd(user_data.password, pid), 10),
        create_date = moment().format('YYYY-MM-DDTHH:MM:SS'),
        mii_hash = new puid(true).generate();

    let document = {
        accounts: [ // WTF even is this??
            {
                account: {
                    attributes: [
                        {
                            attribute: {
                                id: helpers.generateRandID(8), // THIS IS A PLACE HOLDER
                                name: 'environment',
                                updated_by: 'USER',
                                value: 'PROD'
                            }
                        }
                    ],
                    domain: 'ESHOP.NINTENDO.NET',
                    type: 'INTERNAL',
                    id: helpers.generateRandID(9) // THIS IS A PLACE HOLDER
                }  
            }
        ],
        active_flag: 'Y', // No idea what this is or what it's used for, but it seems to be Boolean based
        birth_date: user_data.birth_date,
        country: user_data.country,
        create_date: create_date,
        gender: user_data.gender,
        language: user_data.language,
        updated: create_date,
        marketing_flag: user_data.marketing_flag,
        off_device_flag: user_data.off_device_flag,
        pid: pid,
        email: {
            address: user_data.email,
            id: helpers.generateRandID(8), // THIS IS A PLACE HOLDER
            parent: user_data.parent,
            primary: user_data.primary,
            reachable: 'N',
            type: user_data.type,
            updated_by: 'INTERNAL WS', // Uhhhh.....
            validated: user_data.validated
        },
        mii: {
            status: 'COMPLETED', // idk man, idk
            data: user_data.mii.data,
            id: helpers.generateRandID(10), // THIS IS A PLACE HOLDER
            mii_hash: mii_hash,
            mii_images: [
                {
                    mii_image: {
                        cached_url: constants.URL_ENDPOINTS.mii + mii_hash + '_standard.tga',
                        id: helpers.generateRandID(10), // THIS IS A PLACE HOLDER
                        url: constants.URL_ENDPOINTS.mii + mii_hash + '_standard.tga',
                        type: 'standard'
                    }
                }
            ],
            name: user_data.mii.name,
            primary: user_data.mii.primary,
        },
        region: user_data.region,
        tz_name: user_data.tz_name,
        user_id: user_data.user_id,
        utc_offset: (moment.tz(user_data.tz_name).utcOffset() * 60),
        sensitive: {
            password: password,
            linked_devices: {
                wiiu: {
                    serial: headers['x-nintendo-serial-number'],
                    id: headers['x-nintendo-device-id'],
                    certificate: headers['x-nintendo-device-cert']
                }
            },
            device_attributes: user_data.device_attributes,
            service_agreement: user_data.agreement,
            parental_consent: user_data.parental_consent,
        }
    }

    // At this point we would take `user_data.mii.data`, unpack/decode it and then generate a Mii image
    // using that Mii data. Then save the image as a TGA and upload to the Mii image server.
    // I have not yet cracked the Mii data format. All that I know is that it is base64 encoded.

    await database.user_collection.insert(document);

    response.send(json2xml({
        person: {
            pid: pid
        }
    }));
});

/**
 * [GET]
 * Replacement for: https://account.nintendo.net/v1/api/people/:username
 * Description: Checks if username already in use
 */
routes.get('/:username', async (request, response) => {
    response.set('Content-Type', 'text/xml');
    response.set('Server', 'Nintendo 3DS (http)');
    response.set('X-Nintendo-Date', new Date().getTime());

    let username = request.params.username,
        headers = request.headers;

    if (
        !headers['x-nintendo-client-id'] ||
        !headers['x-nintendo-client-secret'] ||
        !constants.VALID_CLIENT_ID_SECRET_PAIRS[headers['x-nintendo-client-id']] ||
        headers['x-nintendo-client-secret'] !== constants.VALID_CLIENT_ID_SECRET_PAIRS[headers['x-nintendo-client-id']]
    ) {
        let error = {
            errors: {
                error: {
                    cause: 'client_id',
                    code: '0004',
                    message: 'API application invalid or incorrect application credentials'
                }
            }
        }

        return response.send(json2xml(error));
    }

    let user_exists = await helpers.doesUserExist(username);

    if (user_exists) {
        response.status(400);
        response.send();
    }
    
    response.status(200);
    response.end();
});

module.exports = routes;
