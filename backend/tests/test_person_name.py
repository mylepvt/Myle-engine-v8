from app.core.person_name import first_name, person_name


def test_usernames_become_readable_names():
    assert person_name("Akansha_Kharwar") == "Akansha Kharwar"
    assert person_name("anushka_jaiswal") == "Anushka Jaiswal"
    assert person_name("Pushpender_Singh_Sandhu") == "Pushpender Singh Sandhu"
    assert person_name("  Priya   Sharma ") == "Priya Sharma"
    assert person_name("DJ McKenzie") == "DJ McKenzie"  # already-capitalised words stay
    assert person_name("fbo-leader-001") == "fbo-leader-001"  # login ids are not names
    assert person_name(None, "Member") == "Member"


def test_first_name():
    assert first_name("Chandrakala_Balaji_Atram") == "Chandrakala"
    assert first_name("", "A teammate") == "A teammate"
